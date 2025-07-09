#!/bin/bash

# Start the WebSocket server in the background
echo "Starting Cabal WebSocket server..."
npm run server &
SERVER_PID=$!

# Give server time to initialize
sleep 2

# Start the TUI
echo "Starting TUI..."
cd tui && go run .

# Cleanup on exit
trap "kill $SERVER_PID" EXIT