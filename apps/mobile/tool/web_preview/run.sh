#!/usr/bin/env bash
# Live preview loop for the owner's phone (owner 2026-10-07). Keeps a
# separate checkout of BRANCH, rebuilds the web preview whenever the branch
# gets a new commit on GitHub, serves it (serve.mjs) and, when cloudflared
# is installed, publishes it at a public https://….trycloudflare.com link
# that opens on the phone from any network. Stop with Ctrl-C.
#
#   tool/web_preview/run.sh BRANCH [port]
#
# Run from anywhere inside the repo; needs git, flutter, node. Your own
# working tree is not touched: the build lives in ~/.lawbid-preview.
set -euo pipefail

BRANCH="${1:?usage: run.sh BRANCH [port]}"
PORT="${2:-8080}"
TOOLS_BRANCH="${PREVIEW_TOOLS_BRANCH:-claude/live-preview-wp7ow7}"
REPO="$(git rev-parse --show-toplevel)"
WORK="${PREVIEW_HOME:-$HOME/.lawbid-preview}"
SRC="$WORK/src"
OUT="$WORK/site"
LOG="$WORK/preview.log"
mkdir -p "$WORK"

if [[ ! -e "$SRC/.git" ]]; then
  git -C "$REPO" fetch -q origin "$BRANCH"
  git -C "$REPO" worktree add -f --detach "$SRC" "origin/$BRANCH" >/dev/null
fi

build() {
  git -C "$SRC" fetch -q origin "$BRANCH"
  git -C "$SRC" checkout -q --detach "origin/$BRANCH"
  # Until the web fixes and these scripts are on main, bring them in.
  if [[ ! -x "$SRC/apps/mobile/tool/web_preview/build.sh" ]]; then
    git -C "$SRC" fetch -q origin "$TOOLS_BRANCH"
    git -C "$SRC" -c user.name=preview -c user.email=preview@localhost \
      merge -q --no-edit "origin/$TOOLS_BRANCH" >/dev/null ||
      { git -C "$SRC" merge --abort; echo "cannot merge $TOOLS_BRANCH"; return; }
  fi
  echo "$(date '+%H:%M:%S') building $(git -C "$SRC" rev-parse --short HEAD)…"
  if (cd "$SRC/apps/mobile" && tool/web_preview/build.sh "$OUT.next") >>"$LOG" 2>&1; then
    rm -rf "$OUT.old"
    if [[ -d "$OUT" ]]; then mv "$OUT" "$OUT.old"; fi
    mv "$OUT.next" "$OUT"
    echo "$(date '+%H:%M:%S') ready: $(cat "$OUT/preview-commit.txt"), reload the page"
  else
    echo "$(date '+%H:%M:%S') build failed, still showing the previous one (see $LOG)"
  fi
}

build
node "$SRC/apps/mobile/tool/web_preview/serve.mjs" "$OUT" "$PORT" &
PIDS=($!)
trap 'kill "${PIDS[@]}" 2>/dev/null' EXIT

if command -v cloudflared >/dev/null; then
  cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" 2>&1 |
    grep --line-buffered -o 'https://[a-z0-9-]*\.trycloudflare\.com' |
    sed -l 's/^/Phone link: /' &
  PIDS+=($!)
else
  echo "cloudflared not installed: open http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I | cut -d' ' -f1):$PORT on the same Wi-Fi"
fi

LAST="$(git -C "$SRC" rev-parse HEAD)"
while sleep 30; do
  NOW="$(git -C "$SRC" ls-remote origin "refs/heads/$BRANCH" | cut -f1)"
  if [[ -n "$NOW" && "$NOW" != "$LAST" ]]; then
    build
    LAST="$(git -C "$SRC" rev-parse HEAD)"
  fi
done
