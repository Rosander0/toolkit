#!/bin/bash
set -e

# Start Gotenberg on internal port 3000 in background
gotenberg --api-port=3000 &
GOTENBERG_PID=$!

echo "[gateway] Waiting for Gotenberg to be ready on port 3000..."
until curl -s http://127.0.0.1:3000/health > /dev/null; do
    sleep 0.5
done
echo "[gateway] Gotenberg is ready."

# Run FastAPI gateway on public PORT (default 8000)
PORT=${PORT:-8000}
echo "[gateway] Starting Office Gateway on port $PORT..."
exec python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
