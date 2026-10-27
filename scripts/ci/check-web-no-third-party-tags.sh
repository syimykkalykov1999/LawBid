#!/usr/bin/env bash
# Privacy round 13 (S13-12): the web app ships ZERO third-party analytics or
# advertising tags. The privacy policy says we neither sell nor share data
# for cross-context advertising; one forgotten pixel would make that false
# (and would put the site under California's Global Privacy Control rules,
# which we answer today with "no tags, nothing to opt out of").
#
# Usage: scripts/ci/check-web-no-third-party-tags.sh [dir ...]
# Default dirs: apps/mobile/web (sources) and apps/mobile/build/web (build,
# when present). Fails when an HTML or JS file in them mentions a tracker.
# Adding a real tag? Then honour `Sec-GPC: 1` / navigator.globalPrivacyControl
# (set do_not_sell, load nothing) and update this list on purpose.
set -eu
cd "$(dirname "$0")/../.."
DIRS=("$@")
if [ ${#DIRS[@]} -eq 0 ]; then
  DIRS=(apps/mobile/web)
  [ -d apps/mobile/build/web ] && DIRS+=(apps/mobile/build/web)
fi
TRACKERS='google-analytics\.com|googletagmanager\.com|googleadservices\.com|googlesyndication\.com|doubleclick\.net|connect\.facebook\.net|facebook\.com/tr|fbevents\.js|analytics\.tiktok\.com|static\.ads-twitter\.com|snap\.licdn\.com|px\.ads\.linkedin\.com|hotjar\.com|clarity\.ms|segment\.com/analytics|cdn\.segment\.com|mixpanel\.com|amplitude\.com|fullstory\.com|heapanalytics\.com|plausible\.io|posthog\.com|sc-static\.net|bat\.bing\.com'
FOUND=0
for d in "${DIRS[@]}"; do
  [ -d "$d" ] || continue
  # the compiled app bundle is excluded: its strings are not page tags
  HITS=$(grep -rIlE "$TRACKERS" "$d" \
    --include='*.html' --include='*.js' --include='*.json' \
    --exclude='main.dart.js' --exclude='*.part.js' --exclude='*.mjs' 2>/dev/null || true)
  if [ -n "$HITS" ]; then
    echo "Third-party tracking tag found in:" >&2
    echo "$HITS" >&2
    FOUND=1
  fi
done
if [ "$FOUND" -ne 0 ]; then
  echo "The web app must ship zero third-party tags (privacy round 13, S13-12)." >&2
  exit 1
fi
echo "web: no third-party tags"
