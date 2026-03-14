"""Google Fit polling server broadcasting wearable data over WebSocket."""
import asyncio
import json
import os
from contextlib import suppress
from pathlib import Path
from typing import Dict, Optional, Set

import websockets
from websockets.server import WebSocketServerProtocol

POLL_INTERVAL_SECONDS = 5
WEBSOCKET_HOST = "localhost"
WEBSOCKET_PORT = 6789

# Global set tracking active websocket clients.
CONNECTED_CLIENTS: Set[WebSocketServerProtocol] = set()


def load_oauth_token() -> Optional[str]:
    """Attempt to load the Google Fit OAuth token from environment or files."""
    env_token = os.getenv("GOOGLE_FIT_OAUTH_TOKEN")
    if env_token:
        return env_token.strip()

    project_root = Path(__file__).resolve().parent
    candidate_env_files = [
        project_root / ".env",
        project_root.parent / ".env",
    ]

    for env_path in candidate_env_files:
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("GOOGLE_FIT_OAUTH_TOKEN="):
                    _, value = line.split("=", 1)
                    return value.strip().strip('"').strip("'")

    candidate_token_files = [
        project_root / "google_fit_token.txt",
        project_root.parent / "google_fit_token.txt",
    ]
    for token_path in candidate_token_files:
        if token_path.exists():
            return token_path.read_text().strip()

    return None


async def fetch_fit_data(oauth_token: Optional[str] = None) -> Dict[str, int]:
    """Fetch the latest wearable metrics.

    Replace this with actual Google Fit REST API query using OAuth token.
    """

    # Replace this with actual Google Fit REST API query using OAuth token
    await asyncio.sleep(0)
    return {"steps": 97, "bpm": 114}


async def broadcast(message: str) -> None:
    """Send a message to all connected websocket clients."""
    if not CONNECTED_CLIENTS:
        return

    to_remove: Set[WebSocketServerProtocol] = set()

    for client in list(CONNECTED_CLIENTS):
        try:
            await client.send(message)
        except websockets.ConnectionClosed:
            to_remove.add(client)

    for client in to_remove:
        CONNECTED_CLIENTS.discard(client)


async def poll_fit_data() -> None:
    """Periodically poll the wearable API and broadcast to clients."""
    oauth_token = load_oauth_token()
    if oauth_token is None:
        print("[google-fit] Warning: No OAuth token found. Using dummy data.")

    while True:
        try:
            data = await fetch_fit_data(oauth_token)
            message = json.dumps(data)
            await broadcast(message)
        except Exception as exc:  # noqa: BLE001 - log and continue polling
            print(f"[google-fit] Polling error: {exc}")
        finally:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def register_client(websocket: WebSocketServerProtocol) -> None:
    CONNECTED_CLIENTS.add(websocket)
    print(f"[google-fit] Client connected ({len(CONNECTED_CLIENTS)} total)")


async def unregister_client(websocket: WebSocketServerProtocol) -> None:
    CONNECTED_CLIENTS.discard(websocket)
    print(f"[google-fit] Client disconnected ({len(CONNECTED_CLIENTS)} remaining)")


async def websocket_handler(websocket: WebSocketServerProtocol) -> None:
    await register_client(websocket)
    try:
        await websocket.wait_closed()
    finally:
        await unregister_client(websocket)


async def main() -> None:
    print(
        f"[google-fit] Starting polling server on ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}"
    )

    poller_task = asyncio.create_task(poll_fit_data())

    try:
        async with websockets.serve(
            websocket_handler,
            WEBSOCKET_HOST,
            WEBSOCKET_PORT,
        ):
            await asyncio.Future()
    finally:
        poller_task.cancel()
        with suppress(asyncio.CancelledError):
            await poller_task


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[google-fit] Server stopped by user")
