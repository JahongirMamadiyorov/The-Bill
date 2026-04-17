#!/bin/bash
# Double-click this file in Finder to start everything

BILL_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$BILL_DIR/restaurant-app/backend"
MOBILE_DIR="$BILL_DIR/RestaurantApp"

# 1. Backend
osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '$BACKEND_DIR' && npm run dev"
end tell
EOF

sleep 1

# 2. Metro with cache reset
osascript <<EOF
tell application "Terminal"
  activate
  do script "cd '$MOBILE_DIR' && npx react-native start --reset-cache"
end tell
EOF

sleep 3

# 3. ADB reverse so the phone can reach Metro
osascript <<EOF
tell application "Terminal"
  activate
  do script "adb reverse tcp:8081 tcp:8081 && adb reverse tcp:3000 tcp:3000 && echo '✅ ADB ports forwarded'"
end tell
EOF
