#!/usr/bin/env bash
# Publishes the browser preview to GitHub Pages (owner 2026-10-07):
# https://syimykkalykov1999.github.io/lawbid-preview/ . Run it after
# pushing a change; the page shows it a minute or two after this ends.
#
#   tool/web_preview/publish.sh [git_ref]
#
# git_ref defaults to this checkout's HEAD. The app calls the prod API
# directly, so that origin is in the admin's web.allowed_origins; sign in
# with a demo code only (docs/ops/demo-world.md). No keys are in the build
# (config/prod.example.json). Needs flutter on PATH and push access to
# the lawbid-preview repository.
set -euo pipefail

REF="${1:-HEAD}"
SITE_REPO="${PREVIEW_SITE_REPO:-https://github.com/syimykkalykov1999/lawbid-preview.git}"
TOOLS_BRANCH="${PREVIEW_TOOLS_BRANCH:-claude/live-preview-wp7ow7}"
REPO="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"
trap 'git -C "$REPO" worktree remove --force "$WORK/src" 2>/dev/null; rm -rf "$WORK"' EXIT

git -C "$REPO" worktree add -q --detach "$WORK/src" "$REF"
SHA="$(git -C "$WORK/src" rev-parse --short HEAD)"
# Until the web fixes and these scripts are on main, bring them in.
if [[ ! -x "$WORK/src/apps/mobile/tool/web_preview/publish.sh" ]]; then
  git -C "$WORK/src" fetch -q origin "$TOOLS_BRANCH"
  git -C "$WORK/src" -c user.name=preview -c user.email=preview@localhost \
    merge -q --no-edit "origin/$TOOLS_BRANCH" >/dev/null
fi

(cd "$WORK/src/apps/mobile" &&
  PREVIEW_API_BASE="https://api.lawbid.dev/api/v1" \
    tool/web_preview/build.sh "$WORK/site" /lawbid-preview/)
echo "$SHA" > "$WORK/site/preview-commit.txt"
touch "$WORK/site/.nojekyll"

# One commit, replacing the previous build (the page keeps no history).
git -C "$WORK/site" init -q -b gh-pages
git -C "$WORK/site" add -A
git -C "$WORK/site" -c user.name=preview -c user.email=preview@localhost \
  commit -q -m "Preview of $SHA"
git -C "$WORK/site" push -q -f "$SITE_REPO" gh-pages
echo "Published $SHA → https://syimykkalykov1999.github.io/lawbid-preview/"
