#!/bin/bash

# Start the TypeScript backend in the background
echo "Starting Cabal backend..."
npm run dev &
BACKEND_PID=$!

# Give backend time to initialize
sleep 2

# Start the TUI
echo "Starting TUI..."
cd tui && go run main.go

# Cleanup on exit
trap "kill $BACKEND_PID" EXIT