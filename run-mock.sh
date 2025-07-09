#!/bin/bash

echo "🧪 Starting Cabal Mock Environment"
echo "================================="
echo ""
echo "This will start:"
echo "1. Mock WebSocket server (no real Claude instances)"
echo "2. TUI interface"
echo ""

# Start mock server in background
echo "Starting mock server..."
npm run mock &
MOCK_PID=$!

# Give server time to start
sleep 3

# Start TUI
echo "Starting TUI..."
cd tui && go run .

# Cleanup
trap "kill $MOCK_PID" EXIT