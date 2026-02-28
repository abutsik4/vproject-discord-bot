#!/usr/bin/env bash
set -euo pipefail

# Sends a plain text Telegram message.
# Prefers TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID from environment.
# Falls back to /opt/jepsencloud-bot/.env (so it matches your existing setup).

ENV_FALLBACK="/opt/jepsencloud-bot/.env"

get_env_value() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 1
  local line
  line=$(grep -m1 -E "^${key}=" "$file" 2>/dev/null || true)
  [[ -n "$line" ]] || return 1
  local value="${line#*=}"
  value=$(printf '%s' "$value" | tr -d '\r' | sed -E 's/^"(.*)"$/\1/; s/^\x27(.*)\x27$/\1/; s/^\s+//; s/\s+$//')
  printf '%s' "$value"
}

TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-""}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-""}

if [[ -z "$TELEGRAM_BOT_TOKEN" ]]; then
  TELEGRAM_BOT_TOKEN=$(get_env_value "TELEGRAM_BOT_TOKEN" "$ENV_FALLBACK" || true)
fi
if [[ -z "$TELEGRAM_CHAT_ID" ]]; then
  TELEGRAM_CHAT_ID=$(get_env_value "TELEGRAM_CHAT_ID" "$ENV_FALLBACK" || true)
fi

: "${TELEGRAM_BOT_TOKEN:?Missing TELEGRAM_BOT_TOKEN (set env or in /opt/jepsencloud-bot/.env)}"
: "${TELEGRAM_CHAT_ID:?Missing TELEGRAM_CHAT_ID (set env or in /opt/jepsencloud-bot/.env)}"

TEXT=${1:-}
if [[ -z "$TEXT" ]]; then
  echo "Usage: $0 \"message text\"" >&2
  exit 2
fi

HOST=$(hostname)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Telegram message limit is 4096 chars.
MAX_LEN=3800
if [[ ${#TEXT} -gt $MAX_LEN ]]; then
  TEXT="${TEXT:0:$MAX_LEN}\n\n(truncated)"
fi

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"

curl -sS --max-time 15 \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=[${HOST}] ${NOW}\n${TEXT}" \
  --data-urlencode "disable_web_page_preview=true" \
  "$API" >/dev/null
