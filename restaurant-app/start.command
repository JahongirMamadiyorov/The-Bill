#!/bin/bash
# Double-click this file to start both the backend and Metro bundler

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
MOBILE_DIR="$(cd "$SCRIPT_DIR/../RestaurantApp" && pwd)"

# Start backend
osascript <<EOF
tell application "Terminal"
  activate
  do script "echo '🚀 Starting Backend...' && cd '$BACKEND_DIR' && npm run dev"
end tell
EOF

sleep 1

# Start Metro with cache reset
osascript <<EOF
tell application "Terminal"
  activate
  do script "echo '📦 Starting Metro (cache cleared)...' && cd '$MOBILE_DIR' && npx react-native start --reset-cache"
end tell
EOF

echo "✅ Both terminals launched."
