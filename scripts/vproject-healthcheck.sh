#!/usr/bin/env bash
set -euo pipefail

PORT=${PORT:-5011}
URL="http://127.0.0.1:${PORT}/healthz"

# Fail fast if the panel isn't responding quickly.
if ! curl -fsS --max-time 5 "$URL" >/dev/null; then
  /opt/vproject-bot/scripts/telegram-send.sh "VPROJECT web healthcheck FAILED: ${URL}"
  exit 2
fi
