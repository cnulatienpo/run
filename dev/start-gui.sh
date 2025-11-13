#!/usr/bin/env bash
# Script to run Electron with X11 forwarding in Codespaces

# Check if we're in Codespaces
if [ -n "$CODESPACES" ]; then
  echo "🚀 Running in GitHub Codespaces"
  echo "Installing X11 utilities..."
  
  # Install X11 utilities if not present
  sudo apt-get update -qq
  sudo apt-get install -y xauth x11-apps
  
  # Set up X11 forwarding
  export DISPLAY=:10.0
  
  echo "💡 To enable GUI:"
  echo "1. In VS Code, open Command Palette (Ctrl+Shift+P)"  
  echo "2. Run: 'Codespaces: Forward Port'"
  echo "3. Forward port 6000 (X11)"
  echo "4. Set visibility to 'Public'"
  echo "5. Then run: npm start"
  
else
  echo "Not in Codespaces - running normally"
  npm start
fi