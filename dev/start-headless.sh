#!/usr/bin/env bash
set -euo pipefail
# Start the app under an Xvfb virtual display and a DBus session
# Usage: ./dev/start-headless.sh

cd "$(dirname "$0")/.."

if ! command -v dbus-run-session >/dev/null 2>&1; then
  echo "ERROR: dbus-run-session not found. Install 'dbus-user-session' or run this on a desktop host."
  exit 1
fi
if ! command -v xvfb-run >/dev/null 2>&1; then
  echo "ERROR: xvfb-run not found. Install 'xvfb' in the container."
  exit 1
fi

echo "Ensure a user DBus socket exists inside the project (no sudo)..."
if [ -x "dev/start-user-dbus.sh" ]; then
  ./dev/start-user-dbus.sh || true
fi

# Export DBUS env vars to point Electron at the project-local socket so it doesn't try /run/dbus
ROOT_DIR="$(pwd)"
PROJECT_DBUS_SOCKET="$ROOT_DIR/run/dbus/system_bus_socket"
export DBUS_SYSTEM_BUS_ADDRESS="unix:path=$PROJECT_DBUS_SOCKET"
export DBUS_SESSION_BUS_ADDRESS="unix:path=$PROJECT_DBUS_SOCKET"

echo "Starting Electron headless (Xvfb + DBus session)..."
# Run electron directly with flags to avoid GPU and sandbox issues in headless/container environments.
# We call the local electron binary via npx so flags like --disable-gpu and --no-sandbox are passed through.
exec dbus-run-session -- xvfb-run --server-args='-screen 0 1280x720x24' -- npx electron --no-sandbox --disable-gpu .
