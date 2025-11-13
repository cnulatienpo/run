#!/usr/bin/env python3
"""Google Fit to WebSocket bridge with OAuth2 authentication."""

from __future__ import annotations

import asyncio
import json
import logging
import threading
from datetime import datetime, time as dt_time
from pathlib import Path
from typing import Dict, Optional, Set

from flask import Flask, jsonify, redirect, request, url_for
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import websockets
from websockets.exceptions import ConnectionClosed
from websockets.server import WebSocketServerProtocol

BASE_DIR = Path(__file__).resolve().parent
CLIENT_SECRET_FILE = BASE_DIR / "client_secret.json"
TOKEN_FILE = BASE_DIR / "token.json"
REDIRECT_URI = "http://localhost:5000/oauth2callback"
POLL_INTERVAL_SECONDS = 10
HEART_RATE_LOOKBACK_MINUTES = 10

SCOPES = [
    "https://www.googleapis.com/auth/fitness.activity.read",
    "https://www.googleapis.com/auth/fitness.heart_rate.read",
]

STEP_DATA_SOURCE = "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps"
HEART_RATE_DATA_SOURCE = "derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm"

app = Flask(__name__)

credentials_lock = threading.Lock()
flow_lock = threading.Lock()
current_credentials: Optional[Credentials] = None
fitness_service = None
flow_by_state: Dict[str, Flow] = {}

connected_clients: Set[WebSocketServerProtocol] = set()
last_broadcast_payload: Optional[Dict[str, object]] = None


def load_credentials() -> Optional[Credentials]:
    if not TOKEN_FILE.exists():
        return None
    try:
        credentials = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        logging.info("Loaded credentials from %s", TOKEN_FILE)
        return credentials
    except Exception as exc:  # pylint: disable=broad-except
        logging.warning("Failed to read credentials: %s", exc)
        return None


def save_credentials(credentials: Credentials) -> None:
    try:
        TOKEN_FILE.write_text(credentials.to_json())
        logging.info("Saved credentials to %s", TOKEN_FILE)
    except Exception as exc:  # pylint: disable=broad-except
        logging.error("Unable to write credentials file: %s", exc)


def set_credentials(credentials: Credentials) -> None:
    global current_credentials, fitness_service  # pylint: disable=global-statement
    with credentials_lock:
        current_credentials = credentials
        fitness_service = None
    save_credentials(credentials)


def invalidate_credentials() -> None:
    global current_credentials, fitness_service  # pylint: disable=global-statement
    with credentials_lock:
        current_credentials = None
        fitness_service = None
    if TOKEN_FILE.exists():
        try:
            TOKEN_FILE.unlink()
            logging.info("Cleared saved credentials; re-authentication required.")
        except OSError as exc:
            logging.warning("Unable to remove token file: %s", exc)


def ensure_credentials() -> Optional[Credentials]:
    global current_credentials  # pylint: disable=global-statement
    with credentials_lock:
        creds = current_credentials
    if creds is None:
        creds = load_credentials()
        if creds is not None:
            with credentials_lock:
                current_credentials = creds
    if creds is None:
        return None

    if not creds.valid:
        if creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
                save_credentials(creds)
                logging.info("Refreshed access token")
            except Exception as exc:  # pylint: disable=broad-except
                logging.error("Failed to refresh credentials: %s", exc)
                invalidate_credentials()
                return None
        else:
            logging.warning("Stored credentials are invalid; re-authentication required")
            invalidate_credentials()
            return None
    return creds


def create_flow() -> Flow:
    if not CLIENT_SECRET_FILE.exists():
        raise FileNotFoundError(
            "Missing client_secret.json. Download it from the Google Cloud Console "
            "and place it in the googlefit-bridge directory."
        )
    flow = Flow.from_client_secrets_file(
        str(CLIENT_SECRET_FILE),
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )
    return flow


@app.route("/")
def index() -> str:
    if not CLIENT_SECRET_FILE.exists():
        return (
            "<h1>Google Fit Bridge</h1>"
            "<p>Place your <code>client_secret.json</code> inside the "
            "<code>googlefit-bridge/</code> directory to begin.</p>"
        )

    creds = ensure_credentials()
    if creds is not None:
        return (
            "<h1>Google Fit Bridge</h1>"
            "<p>Authentication complete. You can close this window.</p>"
            "<p>WebSocket bridge: <code>ws://localhost:6789</code></p>"
        )

    authorize_url = url_for("authorize", _external=True)
    return (
        "<h1>Google Fit Bridge</h1>"
        f"<p>No credentials found. <a href=\"{authorize_url}\">Authorize with Google Fit</a> to continue.</p>"
    )


@app.route("/authorize")
def authorize():  # type: ignore[override]
    try:
        flow = create_flow()
    except FileNotFoundError as exc:
        return str(exc), 400

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    with flow_lock:
        flow_by_state[state] = flow
    logging.info("OAuth flow started; awaiting callback")
    return redirect(authorization_url)


@app.route("/oauth2callback")
def oauth2callback():  # type: ignore[override]
    state = request.args.get("state")
    if not state:
        return "Missing state parameter.", 400

    with flow_lock:
        flow = flow_by_state.pop(state, None)
    if flow is None:
        return "Unknown or expired OAuth state.", 400

    try:
        flow.fetch_token(authorization_response=request.url)
    except Exception as exc:  # pylint: disable=broad-except
        logging.error("OAuth token exchange failed: %s", exc)
        return "Failed to authenticate with Google Fit. Check the logs for details.", 400

    credentials = flow.credentials
    set_credentials(credentials)
    logging.info("OAuth flow completed successfully")
    return (
        "<h1>Authentication successful</h1>"
        "<p>You can close this tab. The Google Fit bridge is now running.</p>"
    )


@app.route("/status")
def status():  # type: ignore[override]
    creds = ensure_credentials()
    return jsonify(
        {
            "authenticated": creds is not None,
            "scopes": SCOPES,
            "token_file": str(TOKEN_FILE),
            "connected_clients": len(connected_clients),
        }
    )


def get_fitness_service(credentials: Credentials):
    global fitness_service  # pylint: disable=global-statement
    if fitness_service is None:
        fitness_service = build(
            "fitness",
            "v1",
            credentials=credentials,
            cache_discovery=False,
        )
    return fitness_service


def _collect_step_count(service, start_ms: int, end_ms: int) -> int:
    body = {
        "aggregateBy": [
            {
                "dataSourceId": STEP_DATA_SOURCE,
            }
        ],
        "bucketByTime": {"durationMillis": end_ms - start_ms or 86400000},
        "startTimeMillis": start_ms,
        "endTimeMillis": end_ms,
    }
    response = (
        service.users()
        .dataset()
        .aggregate(userId="me", body=body)
        .execute()
    )
    total_steps = 0
    for bucket in response.get("bucket", []):
        for dataset in bucket.get("dataset", []):
            for point in dataset.get("point", []):
                for value in point.get("value", []):
                    if "intVal" in value:
                        total_steps += int(value["intVal"])
                    elif "fpVal" in value:
                        total_steps += int(value["fpVal"])
    return total_steps


def _collect_latest_heart_rate(service, start_ns: int, end_ns: int) -> Optional[float]:
    dataset_id = f"{start_ns}-{end_ns}"
    response = (
        service.users()
        .dataSources()
        .datasets()
        .get(
            userId="me",
            dataSourceId=HEART_RATE_DATA_SOURCE,
            datasetId=dataset_id,
        )
        .execute()
    )
    points = response.get("point", [])
    if not points:
        return None
    latest_point = max(points, key=lambda point: int(point.get("endTimeNanos", "0")))
    for value in latest_point.get("value", []):
        if "fpVal" in value:
            return float(value["fpVal"])
        if "intVal" in value:
            return float(value["intVal"])
    return None


def fetch_fit_metrics(credentials: Credentials) -> Dict[str, Optional[float]]:
    service = get_fitness_service(credentials)
    now = datetime.now()
    start_of_day = datetime.combine(now.date(), dt_time.min)
    start_ms = int(start_of_day.timestamp() * 1000)
    end_ms = int(now.timestamp() * 1000)

    steps = _collect_step_count(service, start_ms, end_ms)

    heart_start_ms = max(start_ms, end_ms - HEART_RATE_LOOKBACK_MINUTES * 60 * 1000)
    heart_rate = _collect_latest_heart_rate(service, heart_start_ms * 1_000_000, end_ms * 1_000_000)

    data: Dict[str, Optional[float]] = {"steps": float(steps)}
    if heart_rate is not None:
        data["bpm"] = heart_rate
    return data


async def broadcast(message: str) -> None:
    if not connected_clients:
        return
    stale_clients = []
    for websocket in list(connected_clients):
        try:
            await websocket.send(message)
        except ConnectionClosed:
            stale_clients.append(websocket)
        except Exception as exc:  # pylint: disable=broad-except
            logging.warning("Failed to send payload to client: %s", exc)
            stale_clients.append(websocket)
    for websocket in stale_clients:
        connected_clients.discard(websocket)


async def poll_loop() -> None:
    global last_broadcast_payload  # pylint: disable=global-statement
    while True:
        credentials = ensure_credentials()
        if credentials is None:
            logging.info("Awaiting user authentication…")
            await asyncio.sleep(5)
            continue

        loop = asyncio.get_running_loop()
        try:
            metrics = await loop.run_in_executor(None, fetch_fit_metrics, credentials)
        except HttpError as exc:
            status = getattr(exc.resp, "status", None)
            if status in (401, 403):
                logging.error("Authorization error from Google Fit API (%s). Resetting credentials.", status)
                invalidate_credentials()
            else:
                logging.exception("Google Fit API error: %s", exc)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            continue
        except Exception as exc:  # pylint: disable=broad-except
            logging.exception("Unexpected error while polling Google Fit: %s", exc)
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            continue

        if not metrics:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            continue

        payload = {key: value for key, value in metrics.items() if value is not None}
        message_data: Dict[str, object] = {
            "steps": int(round(float(payload.get("steps", 0.0)))),
        }
        bpm_value = payload.get("bpm")
        if bpm_value is not None:
            message_data["bpm"] = int(round(float(bpm_value)))

        message = json.dumps(message_data)
        await broadcast(message)
        last_broadcast_payload = message_data
        logging.info("Broadcasted payload: %s", message_data)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def websocket_handler(websocket: WebSocketServerProtocol) -> None:
    logging.info("WebSocket client connected: %s", websocket.remote_address)
    connected_clients.add(websocket)
    try:
        if last_broadcast_payload:
            initial_payload = {
                "steps": int(last_broadcast_payload.get("steps", 0)),
            }
            if "bpm" in last_broadcast_payload and last_broadcast_payload["bpm"] is not None:
                initial_payload["bpm"] = round(last_broadcast_payload["bpm"], 0)
            await websocket.send(json.dumps(initial_payload))
        await websocket.wait_closed()
    finally:
        connected_clients.discard(websocket)
        logging.info("WebSocket client disconnected: %s", websocket.remote_address)


def run_flask_app() -> None:
    logging.info("Starting OAuth helper on http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)


async def main_async() -> None:
    server = await websockets.serve(websocket_handler, "127.0.0.1", 6789)
    logging.info("WebSocket bridge available at ws://localhost:6789")
    try:
        await poll_loop()
    finally:
        server.close()
        await server.wait_closed()


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s %(message)s",
    )
    flask_thread = threading.Thread(target=run_flask_app, name="OAuthHelper", daemon=True)
    flask_thread.start()

    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        logging.info("Shutting down Google Fit bridge")


if __name__ == "__main__":
    main()
