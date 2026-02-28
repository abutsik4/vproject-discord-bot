#!/usr/bin/env bash
set -euo pipefail

# Safe folder transfer to a remote host using rsync.
# - Runs a dry-run first
# - Optionally creates a remote backup of the destination directory
# - Can mirror (delete extraneous remote files) or just update
# - Performs a post-sync verification dry-run using checksums
#
# Usage examples:
#   ./scripts/transfer_to_vps.sh --host example.com --user ubuntu --dest /opt/vproject-bot --mode mirror
#   ./scripts/transfer_to_vps.sh --host example.com --user root --dest /opt/vproject-bot --mode update --no-backup
#
# Notes:
# - If your destination is under /opt, this script uses `sudo rsync` on the remote side.
# - You may be prompted for the remote user's sudo password (and/or SSH password).

HOST=""
USER_NAME=""
SSH_PORT="22"
DEST="/opt/vproject-bot"
MODE="mirror"   # mirror|update
BACKUP="1"       # 1|0
VERIFY="1"       # 1|0

print_usage() {
  cat <<'USAGE'
Usage: transfer_to_vps.sh [options]

Options:
  --host <host>         Remote host/IP (required)
  --user <user>         SSH username (required)
  --port <port>         SSH port (default: 22)
  --dest <path>         Destination path on remote (default: /opt/vproject-bot)
  --mode <mirror|update>  mirror deletes extra remote files; update never deletes (default: mirror)
  --no-backup           Do not create a remote backup before mirroring
  --no-verify           Skip post-sync verification
  -h, --help            Show help

Environment overrides:
  SRC=<path>            Source directory (defaults to repo root: one level above this script)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --user) USER_NAME="$2"; shift 2 ;;
    --port) SSH_PORT="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --no-backup) BACKUP="0"; shift 1 ;;
    --no-verify) VERIFY="0"; shift 1 ;;
    -h|--help) print_usage; exit 0 ;;
    *) echo "Unknown arg: $1"; print_usage; exit 2 ;;
  esac
done

if [[ "$MODE" != "mirror" && "$MODE" != "update" ]]; then
  echo "Invalid --mode: $MODE (expected mirror or update)" >&2
  exit 2
fi

if [[ -z "$HOST" || -z "$USER_NAME" ]]; then
  echo "Missing required args: --host and --user" >&2
  echo >&2
  print_usage >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SRC:-"$(cd "$SCRIPT_DIR/.." && pwd)"}"

REMOTE="${USER_NAME}@${HOST}"
TS="$(date +%Y%m%d-%H%M%S)"

ssh_base=(ssh -p "$SSH_PORT" -o ServerAliveInterval=30 -o ServerAliveCountMax=120 -o ConnectTimeout=10)

# If destination is likely privileged, run rsync as root on the remote end.
remote_rsync_path="rsync"
if [[ "$DEST" == /opt/* || "$DEST" == /etc/* || "$DEST" == /usr/* || "$DEST" == /var/* ]]; then
  remote_rsync_path="sudo rsync"
fi

rsync_common=(
  -aHAX
  --numeric-ids
  --protect-args
  --partial
  --partial-dir=.rsync-partial
  --info=progress2
  --human-readable
  --rsync-path="$remote_rsync_path"
  -e "ssh -p $SSH_PORT -o ServerAliveInterval=30 -o ServerAliveCountMax=120 -o ConnectTimeout=10"
)

if [[ "$MODE" == "mirror" ]]; then
  rsync_common+=(--delete-delay)
fi

if [[ ! -d "$SRC" ]]; then
  echo "Source directory not found: $SRC" >&2
  exit 2
fi

if [[ -z "$(command -v rsync)" ]]; then
  echo "rsync not found locally. Please install it and re-run." >&2
  exit 2
fi

if [[ -z "$(command -v ssh)" ]]; then
  echo "ssh not found locally. Please install it and re-run." >&2
  exit 2
fi

echo "== Preflight =="
echo "Source:      $SRC"
echo "Remote:      $REMOTE"
echo "Dest:        $DEST"
echo "Mode:        $MODE"
echo "Backup:      $BACKUP"
echo "Verify:      $VERIFY"

if [[ "$HOST" =~ ^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[0-1])\. ]]; then
  echo "Note: $HOST is a private RFC1918 address; this machine must be on the same LAN/VPN (or have routing) for SSH to work." >&2
fi

# Connectivity check (will prompt if password auth is used).
"${ssh_base[@]}" "$REMOTE" "echo connected" >/dev/null

# Prepare destination directory; may prompt for sudo password if needed.
"${ssh_base[@]}" -t "$REMOTE" "
  set -e;
  if command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p '$DEST';
    sudo chown -R '$USER_NAME':'$USER_NAME' '$DEST' || true;
  else
    mkdir -p '$DEST';
  fi
"

if [[ "$MODE" == "mirror" && "$BACKUP" == "1" ]]; then
  echo "== Remote backup (before mirroring) =="
  "${ssh_base[@]}" -t "$REMOTE" "
    set -e;
    if [ -d '$DEST' ] && [ \"\$(ls -A '$DEST' 2>/dev/null || true)\" != '' ]; then
      if command -v sudo >/dev/null 2>&1; then
        sudo mv '$DEST' '${DEST}.bak-$TS';
        sudo mkdir -p '$DEST';
        sudo chown -R '$USER_NAME':'$USER_NAME' '$DEST' || true;
      else
        mv '$DEST' '${DEST}.bak-$TS';
        mkdir -p '$DEST';
      fi
      echo 'Backed up to: ${DEST}.bak-$TS';
    else
      echo 'No existing remote data to back up.';
    fi
  "
fi

echo "== Dry-run (shows what would change) =="
rsync -n "${rsync_common[@]}" "$SRC/" "$REMOTE:$DEST/"

echo
read -r -p "Proceed with REAL sync? Type YES to continue: " confirm
if [[ "$confirm" != "YES" ]]; then
  echo "Aborted. No changes were made." >&2
  exit 1
fi

echo "== Syncing =="
rsync "${rsync_common[@]}" "$SRC/" "$REMOTE:$DEST/"

echo "== Done syncing =="

if [[ "$VERIFY" == "1" ]]; then
  echo "== Verify (checksum-based dry-run; should show no changes) =="
  # `-c` forces checksum comparison for regular files.
  # We filter the output down to lines that represent real diffs/transfers.
  rsync_verify=(
    -n
    -c
    --no-motd
    --itemize-changes
    --out-format='%i %n%L'
  )

  tmp_verify_out="$(mktemp)"
  set +e
  rsync "${rsync_verify[@]}" "${rsync_common[@]}" "$SRC/" "$REMOTE:$DEST/" >"$tmp_verify_out"
  rc=$?
  set -e

  verify_out="$(grep -E '^(\*deleting|>)' "$tmp_verify_out" || true)"
  rm -f "$tmp_verify_out"

  if [[ $rc -ne 0 ]]; then
    echo "Verification rsync failed (exit $rc)." >&2
    exit $rc
  fi

  if [[ -n "$verify_out" ]]; then
    echo "Verification found differences (showing output):" >&2
    echo "$verify_out" >&2
    echo "If this is unexpected, re-run the sync; the transfer is resumable." >&2
    exit 3
  fi

  echo "Verification OK (no differences reported)."
fi

echo "All done. Remote path: $REMOTE:$DEST"