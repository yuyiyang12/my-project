@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PORT=8791
echo Game running at: http://localhost:%PORT%/index.html
echo Keep this window open while playing. Press Ctrl+C to stop.
start "" "http://localhost:%PORT%/index.html"
python -m http.server %PORT%
