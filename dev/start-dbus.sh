#!/usr/bin/env bash
set -euo pipefail
# Start a system dbus daemon listening on /run/dbus/system_bus_socket if it's not already present.
# This may require sudo since /run is owned by root.

SOCKET_PATH=/run/dbus/system_bus_socket

if [ -S "$SOCKET_PATH" ]; then
  echo "System DBus socket already exists: $SOCKET_PATH"
  exit 0
fi

echo "Creating /run/dbus (if needed) and starting system dbus-daemon..."
if [ ! -d /run/dbus ]; then
  sudo mkdir -p /run/dbus
  sudo chown root:root /run/dbus
  sudo chmod 755 /run/dbus
fi

if ! command -v dbus-daemon >/dev/null 2>&1; then
  echo "ERROR: dbus-daemon is not installed. Run: sudo apt-get update && sudo apt-get install -y dbus"
  exit 1
fi

# Start dbus-daemon as a system instance that creates the unix socket.
sudo dbus-daemon --system --fork --nopidfile --address=unix:path=$SOCKET_PATH

if [ -S "$SOCKET_PATH" ]; then
  echo "Started system dbus and created socket: $SOCKET_PATH"
else
  echo "Failed to create system dbus socket at $SOCKET_PATH"
  exit 1
fi
start-dbus.sh