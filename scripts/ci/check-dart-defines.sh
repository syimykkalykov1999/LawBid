#!/usr/bin/env bash
# Mobile release preflight (audit 2026-11-02): the dart-defines JSON that
# becomes config/<flavor>.json must be a JSON object with the keys the app
# cannot work without. An empty or half-filled secret used to be written
# as-is and show up as a failed `flutter build` after Flutter, Ruby and
# pub get were installed, or worse as a valid build with empty keys.
#
#   check-dart-defines.sh <file> --require KEY... [--warn KEY...]
# --require: missing or empty -> exit 1. --warn: ::warning:: only (features
# that are off on purpose until the owner fills them, e.g. Stripe live).
# Values are never printed.
set -u
f="${1:?file}"; shift
mode=""; req=(); warn=()
for a in "$@"; do
  case "$a" in
    --require) mode=r ;; --warn) mode=w ;;
    *) if [ "$mode" = r ]; then req+=("$a"); elif [ "$mode" = w ]; then warn+=("$a"); else echo "usage: check-dart-defines.sh <file> --require KEY... [--warn KEY...]" >&2; exit 2; fi ;;
  esac
done
[ -s "$f" ] || { echo "::error::$f is empty: the MOBILE_DART_DEFINES_JSON secret is not set"; exit 1; }
jq -e 'type == "object"' "$f" >/dev/null 2>&1 || { echo "::error::$f is not a JSON object (check the MOBILE_DART_DEFINES_JSON secret)"; exit 1; }
bad=0
for k in ${req[@]+"${req[@]}"}; do
  jq -e --arg k "$k" '(.[$k] // "") | tostring | length > 0' "$f" >/dev/null 2>&1 || { echo "::error::dart-define $k is missing or empty in $f"; bad=1; }
done
for k in ${warn[@]+"${warn[@]}"}; do
  jq -e --arg k "$k" '(.[$k] // "") | tostring | length > 0' "$f" >/dev/null 2>&1 || echo "::warning::dart-define $k is empty: the feature behind it is off in this build"
done
[ "$bad" = 0 ] && echo "ok   dart-defines in $f"
exit "$bad"
