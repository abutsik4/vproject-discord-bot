#!/usr/bin/env bash
set -euo pipefail

# Aggressive cleanup: archive non-essential files for review instead of deleting.
# Creates backups/cleanup_TIMESTAMP/* folders and moves items there.

ROOT="/opt/vproject-bot"
TS=$(date +%Y%m%d_%H%M%S)
ARCHIVE="$ROOT/backups/cleanup_$TS"

mkdir -p "$ARCHIVE"/{docs,status,docker,pm2,scripts,logs,data,other}

log() { printf "[cleanup] %s\n" "$*"; }

safe_move() {
  local src="$1" dest="$2"
  if [ -e "$src" ]; then
    mkdir -p "$dest"
    mv -f "$src" "$dest/" || true
    log "moved: $src -> $dest/"
  fi
}

log "Archiving to: $ARCHIVE"

# 1) Docs + status artifacts (keep nothing by default; they are archived)
for f in "$ROOT"/*.md "$ROOT"/*.txt; do
  [ -e "$f" ] || continue
  safe_move "$f" "$ARCHIVE/docs"
done

# 2) Alternative deployment methods (we standardize on systemd)
safe_move "$ROOT/ecosystem.config.js" "$ARCHIVE/pm2"
safe_move "$ROOT/24-7-start.sh" "$ARCHIVE/pm2"
safe_move "$ROOT/bot.sh" "$ARCHIVE/pm2"

safe_move "$ROOT/Dockerfile" "$ARCHIVE/docker"
safe_move "$ROOT/docker-compose.yml" "$ARCHIVE/docker"

# 3) Local log files
for f in "$ROOT"/logs/*.log; do
  [ -e "$f" ] || continue
  safe_move "$f" "$ARCHIVE/logs"
done

# 4) Likely-unused data artifacts (not referenced in src/)
safe_move "$ROOT/data/reactionroles.json" "$ARCHIVE/data"
safe_move "$ROOT/data/logs.json" "$ARCHIVE/data"

# 5) One-off helper scripts (leave transfer_to_vps.sh in place)
# Keep telegram scripts and healthcheck scripts.
# (No moves here by default.)

log "Cleanup complete. Review archived files under $ARCHIVE"
log "Rollback example: mv -f $ARCHIVE/docs/* $ROOT/"
