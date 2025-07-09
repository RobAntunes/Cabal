#!/bin/bash

echo "🚀 Starting Enhanced Cabal with Notifications"
echo "=========================================="
echo ""
echo "Features:"
echo "✅ Visual notification system (colored borders)"
echo "✅ Human-in-the-loop architecture"
echo "✅ Autonomous agent operations"
echo "✅ Real-time status updates"
echo ""

# Check if we should run in mock mode
if [ "$1" == "--mock" ]; then
    echo "Running in MOCK mode (no real Claude instances)"
    SERVER_CMD="npm run enhanced-mock"
else
    echo "Running in PRODUCTION mode (requires Claude CLI)"
    SERVER_CMD="npm run enhanced-server"
fi

echo ""
echo "Starting enhanced server..."
$SERVER_CMD &
SERVER_PID=$!

# Give server time to start
sleep 3

# Start TUI
echo "Starting enhanced TUI..."
cd tui && go run .

# Cleanup
trap "kill $SERVER_PID" EXIT