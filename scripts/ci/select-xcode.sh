#!/usr/bin/env bash
# Pick the Xcode for an iOS build and FAIL EARLY when the runner has none new
# enough (audit 2026-11-02). Apple only accepts uploads built with the
# current iOS SDK (Xcode 26 since April 2026); `macos-latest` moves, and a too-old
# Xcode shows up only as a rejected TestFlight upload after a 20-minute build.
#
#   select-xcode.sh [<min-major>]    default 26 - THE one place to raise it when Apple does
# Takes the highest non-beta/RC Xcode_<version>.app in $XCODE_APPS_DIR
# (default /Applications) whose major is >= min, selects it with
# `xcode-select` (override: XCODE_SELECT_CMD, tests put a stub there) and
# prints the choice. Exit 1 when none qualifies (the list is printed).
set -u
MIN="${1:-26}"
DIR="${XCODE_APPS_DIR:-/Applications}"
SELECT="${XCODE_SELECT_CMD:-sudo xcode-select -s}"
best=""; bestver=""
for app in "$DIR"/Xcode_*.app; do
  [ -d "$app" ] || continue
  name="$(basename "$app" .app)"; ver="${name#Xcode_}"
  case "$ver" in *[!0-9.]*) continue ;; esac   # skips _beta, _RC, "Xcode_26.0_Release_Candidate"
  [ "${ver%%.*}" -ge "$MIN" ] || continue
  if [ -z "$best" ] || [ "$(printf '%s\n%s\n' "$bestver" "$ver" | sort -V | tail -1)" = "$ver" ]; then best="$app"; bestver="$ver"; fi
done
if [ -z "$best" ]; then
  echo "::error::no stable Xcode >= $MIN on this runner (found: $(ls -d "$DIR"/Xcode_*.app 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ' ')). Apple rejects uploads built with an older iOS SDK."
  exit 1
fi
$SELECT "$best/Contents/Developer" || { echo "::error::could not select $best"; exit 1; }
echo "ok   Xcode $bestver selected ($best)"
