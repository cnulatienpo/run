"""Google Fit WebSocket bridge.

This module authenticates with Google via OAuth2, polls Google Fit for
recent step count and heart rate samples, and broadcasts the data to
connected WebSocket clients. The server is designed to run locally as a
companion to the Electron HUD.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Set

import websockets
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from websockets.server import WebSocketServerProtocol

SCOPES = [
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.heart_rate.read",
]

STEP_DATA_SOURCE = (
    "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
)
HEART_RATE_DATA_SOURCE = (
    "derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm"
)

POLL_INTERVAL_SECONDS = 5
DATA_WINDOW_SECONDS = 60
DEFAULT_WS_PORT = 6789
DEFAULT_WS_HOST = "0.0.0.0"

BASE_DIR = Path(__file__).resolve().parent
CLIENT_SECRETS_PATH = BASE_DIR / "client_secrets.json"
TOKEN_PATH = BASE_DIR / "token.json"

logger = logging.getLogger("google_fit_ws_server")


def save_credentials(credentials: Credentials) -> None:
    """Persist credentials to disk for reuse."""

    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(credentials.to_json())
    logger.debug("Saved refreshed credentials to %s", TOKEN_PATH)


def load_saved_credentials() -> Optional[Credentials]:
    """Load stored credentials if they exist."""

    if not TOKEN_PATH.exists():
        return None

    try:
        credentials = Credentials.from_authorized_user_file(
            str(TOKEN_PATH), SCOPES
        )
        logger.info("Loaded cached credentials from %s", TOKEN_PATH)
        return credentials
    except Exception as error:  # pylint: disable=broad-except
        logger.warning(
            "Failed to read cached credentials (%s). A new login is required.",
            error,
        )
        with suppress(FileNotFoundError):
            TOKEN_PATH.unlink()
        return None


def authenticate_user() -> Credentials:
    """Authenticate the user via OAuth2 and return credentials."""

    if not CLIENT_SECRETS_PATH.exists():
        raise FileNotFoundError(
            "client_secrets.json was not found. Download OAuth 2.0 client "
            "credentials from the Google Cloud Console and place the file "
            f"at {CLIENT_SECRETS_PATH}."
        )

    credentials = load_saved_credentials()

    if credentials and credentials.expired and credentials.refresh_token:
        try:
            credentials.refresh(Request())
            save_credentials(credentials)
            return credentials
        except RefreshError as error:
            logger.warning("Cached credentials refresh failed: %s", error)
            credentials = None
            with suppress(FileNotFoundError):
                TOKEN_PATH.unlink()

    if credentials and credentials.valid:
        return credentials

    flow = InstalledAppFlow.from_client_secrets_file(
        str(CLIENT_SECRETS_PATH), scopes=SCOPES
    )
    logger.info("Launching browser for Google authentication…")
    credentials = flow.run_local_server(port=0, prompt="consent")
    save_credentials(credentials)
    logger.info("Authentication complete.")
    return credentials


def _nanoseconds(dt: datetime) -> int:
    return int(dt.timestamp() * 1_000_000_000)


def _fetch_latest_point(
    service: Any, data_source_id: str, window_seconds: int
) -> Optional[Dict[str, Any]]:
    """Fetch the latest data point for the provided data source."""

    end_time = datetime.now(tz=timezone.utc)
    start_time = end_time - timedelta(seconds=window_seconds)
    dataset_id = f"{_nanoseconds(start_time)}-{_nanoseconds(end_time)}"

    try:
        dataset = (
            service.users()
            .dataSources()
            .datasets()
            .get(
                userId="me",
                dataSourceId=data_source_id,
                datasetId=dataset_id,
            )
            .execute()
        )
    except HttpError as error:  # type: ignore[not-callable]
        logger.error(
            "Google Fit API error while fetching %s: %s", data_source_id, error
        )
        return None
    except Exception as error:  # pylint: disable=broad-except
        logger.exception("Unexpected error retrieving %s", data_source_id)
        return None

    points = dataset.get("point", [])
    if not points:
        return None

    latest_point = max(
        points, key=lambda point: int(point.get("endTimeNanos", "0") or "0")
    )
    return latest_point


def _extract_int(point: Dict[str, Any]) -> Optional[int]:
    for entry in point.get("value", []):
        if "intVal" in entry:
            return int(entry["intVal"])
        if "fpVal" in entry:
            return int(round(float(entry["fpVal"])) )
    return None


def _extract_float(point: Dict[str, Any]) -> Optional[float]:
    for entry in point.get("value", []):
        if "fpVal" in entry:
            return float(entry["fpVal"])
        if "intVal" in entry:
            return float(entry["intVal"])
    return None


def get_latest_steps(service: Any) -> Optional[int]:
    """Return the most recent step count delta."""

    point = _fetch_latest_point(service, STEP_DATA_SOURCE, DATA_WINDOW_SECONDS)
    if not point:
        return None
    return _extract_int(point)


def get_latest_bpm(service: Any) -> Optional[float]:
    """Return the most recent heart rate sample."""

    point = _fetch_latest_point(service, HEART_RATE_DATA_SOURCE, DATA_WINDOW_SECONDS)
    if not point:
        return None
    return _extract_float(point)


def _ensure_valid_credentials(credentials: Credentials) -> None:
    if not credentials.expired:
        return
    if not credentials.refresh_token:
        logger.error("OAuth credentials expired and no refresh token is available.")
        return
    try:
        credentials.refresh(Request())
        save_credentials(credentials)
        logger.info("OAuth token refreshed successfully.")
    except RefreshError as error:
        logger.error("Failed to refresh OAuth token: %s", error)


async def broadcast_loop(
    clients: Set[WebSocketServerProtocol],
    service: Any,
    credentials: Credentials,
    poll_interval: int = POLL_INTERVAL_SECONDS,
) -> None:
    """Poll Google Fit and broadcast to connected WebSocket clients."""

    while True:
        try:
            _ensure_valid_credentials(credentials)

            steps = get_latest_steps(service)
            bpm = get_latest_bpm(service)

            payload = json.dumps({"steps": steps, "bpm": bpm})

            if not clients:
                continue

            stale_clients: Set[WebSocketServerProtocol] = set()
            broadcast_tasks = []
            for websocket in list(clients):
                broadcast_tasks.append(_send_payload(websocket, payload, stale_clients))

            if broadcast_tasks:
                await asyncio.gather(*broadcast_tasks)

            if stale_clients:
                clients.difference_update(stale_clients)
        except Exception as error:  # pylint: disable=broad-except
            logger.exception("Error during broadcast loop: %s", error)

        await asyncio.sleep(poll_interval)


async def _send_payload(
    websocket: WebSocketServerProtocol,
    payload: str,
    stale_clients: Set[WebSocketServerProtocol],
) -> None:
    try:
        await websocket.send(payload)
    except Exception as error:  # pylint: disable=broad-except
        logger.warning("Failed to send payload to %s: %s", websocket.remote_address, error)
        stale_clients.add(websocket)


async def websocket_handler(
    websocket: WebSocketServerProtocol,
    _path: str,
    clients: Set[WebSocketServerProtocol],
) -> None:
    clients.add(websocket)
    logger.info("Client connected: %s", websocket.remote_address)
    try:
        await websocket.wait_closed()
    finally:
        clients.discard(websocket)
        logger.info("Client disconnected: %s", websocket.remote_address)


async def run_server(credentials: Credentials) -> None:
    service = build("fitness", "v1", credentials=credentials, cache_discovery=False)

    clients: Set[WebSocketServerProtocol] = set()

    host = os.getenv("GFIT_WS_HOST", DEFAULT_WS_HOST)
    port = int(os.getenv("GFIT_WS_PORT", DEFAULT_WS_PORT))

    broadcast_task = asyncio.create_task(broadcast_loop(clients, service, credentials))

    try:
        async with websockets.serve(
            lambda websocket, path: websocket_handler(websocket, path, clients),
            host,
            port,
        ):
            logger.info("WebSocket server listening on %s:%s", host, port)
            await asyncio.Future()
    finally:
        broadcast_task.cancel()
        with suppress(asyncio.CancelledError):
            await broadcast_task


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    )

    try:
        credentials = authenticate_user()
    except Exception as error:  # pylint: disable=broad-except
        logger.exception("Authentication failed: %s", error)
        return

    try:
        asyncio.run(run_server(credentials))
    except KeyboardInterrupt:
        logger.info("Server stopped by user.")


if __name__ == "__main__":
    main()
