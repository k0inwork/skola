#!/bin/bash
set -e

SKOLA_DIR="$HOME/skola"
LOGDIR="/tmp/skola-deploy"
mkdir -p "$LOGDIR"

cd "$SKOLA_DIR"

# Load env vars
set -a; source .env; set +a

BEFORE=$(git rev-parse HEAD)
git pull >> "$LOGDIR/pull.log" 2>&1
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "$(date) — no new commits" >> "$LOGDIR/pull.log"
  exit 0
fi

# Per-commit log
LOG="$LOGDIR/${AFTER}.log"
echo "$(date) — deploy started for $AFTER" > "$LOG"

# Build
echo "$(date) — building" >> "$LOG"
npm run build >> "$LOG" 2>&1

# Push DB schema changes
echo "$(date) — pushing schema" >> "$LOG"
npx drizzle-kit push 2>&1 >> "$LOG" || true

# Restart
echo "$(date) — restarting" >> "$LOG"
systemctl restart skola
systemctl restart caddy 2>/dev/null || true

echo "$(date) — deploy done" >> "$LOG"
ln -sf "$LOG" "$LOGDIR/latest.log"
