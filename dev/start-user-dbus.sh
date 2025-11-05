#!/usr/bin/env bash
set -euo pipefail
# Start a user-mode dbus session daemon that listens on a socket inside the project
# This avoids creating /run/dbus/system_bus_socket and doesn't require sudo.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOCKET_DIR="$ROOT_DIR/run/dbus"
SOCKET_PATH="$SOCKET_DIR/system_bus_socket"

mkdir -p "$SOCKET_DIR"
chmod 755 "$SOCKET_DIR"

if [ -S "$SOCKET_PATH" ]; then
  echo "User DBus socket already exists: $SOCKET_PATH"
  exit 0
fi

if ! command -v dbus-daemon >/dev/null 2>&1; then
  echo "ERROR: dbus-daemon not found. Install 'dbus' package: sudo apt-get update && sudo apt-get install -y dbus"
  exit 1
fi

echo "Starting user dbus-daemon at: $SOCKET_PATH"
# Start a session bus instance bound to the chosen unix socket path.
dbus-daemon --session --fork --nopidfile --address=unix:path=$SOCKET_PATH

if [ -S "$SOCKET_PATH" ]; then
  echo "Started user dbus and created socket: $SOCKET_PATH"
else
  echo "Failed to create user dbus socket at $SOCKET_PATH"
  exit 1
fi
