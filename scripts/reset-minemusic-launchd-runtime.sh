#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
LAUNCH_AGENT_LABEL="com.minemusic.server"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/com.minemusic.server.plist"
TMP_DIR="/tmp/minemusic"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

HOST="${MINEMUSIC_SERVER_HOST:-127.0.0.1}"
PORT="${MINEMUSIC_SERVER_PORT:-37373}"
HEALTH_URL="http://${HOST}:${PORT}/health"
LAUNCHD_TARGET="gui/$(id -u)/${LAUNCH_AGENT_LABEL}"

echo "[minemusic] stopping launchd agent if it is running"
launchctl bootout "$LAUNCHD_TARGET" >/dev/null 2>&1 || true

echo "[minemusic] removing runtime directory: $TMP_DIR"
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR"

echo "[minemusic] bootstrapping launchd agent"
bootstrapped=0
for _ in 1 2 3; do
  if launchctl bootstrap "gui/$(id -u)" "$LAUNCH_AGENT_PLIST" >/dev/null 2>&1; then
    bootstrapped=1
    break
  fi
  sleep 1
done

if [[ "$bootstrapped" -ne 1 ]]; then
  echo "[minemusic] failed to bootstrap launchd agent: $LAUNCH_AGENT_LABEL" >&2
  exit 1
fi

echo "[minemusic] waiting for health endpoint: $HEALTH_URL"
for _ in {1..60}; do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[minemusic] server is healthy"
    curl -fsS "$HEALTH_URL"
    echo
    echo "[minemusic] runtime files:"
    ls -1 "$TMP_DIR"
    exit 0
  fi
  sleep 1
done

echo "[minemusic] server did not become healthy in time" >&2
exit 1
