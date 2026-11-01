#!/bin/bash
# Double-click this file to play. Starts a local HTTP server and opens the game.
cd "$(dirname "$0")" || exit 1
PORT=8791
if lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT already in use, reusing it."
else
  /usr/bin/python3 -m http.server $PORT >/dev/null 2>&1 &
  sleep 1
fi
echo "Game running at: http://localhost:$PORT/index.html"
echo "Keep this window open while playing. Close it or press Ctrl+C to stop."
open "http://localhost:$PORT/index.html"
wait
