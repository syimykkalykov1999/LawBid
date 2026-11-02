#!/usr/bin/env bash
# Offline test of check-dart-defines.sh.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT; fail=0
t() { local name="$1" want="$2" text="$3" content="$4"; shift 4
  printf '%s' "$content" >"$T/c.json"
  out="$("$D/check-dart-defines.sh" "$T/c.json" "$@" 2>&1)"; got=$?
  if [ "$got" != "$want" ] || ! echo "$out" | grep -q -- "$text"; then echo "FAIL $name: exit $got (want $want): $out"; fail=1; else echo "ok   $name"; fi; }
t "complete" 0 "ok" '{"API_BASE_URL":"https://a","DEEP_LINK_HOST":"x"}' --require API_BASE_URL DEEP_LINK_HOST
t "empty file" 1 "secret is not set" ''
t "not json" 1 "not a JSON object" 'oops'
t "array is not an object" 1 "not a JSON object" '[]'
t "required key empty" 1 "API_BASE_URL is missing" '{"API_BASE_URL":""}' --require API_BASE_URL
t "required key absent" 1 "DEEP_LINK_HOST is missing" '{"API_BASE_URL":"x"}' --require API_BASE_URL DEEP_LINK_HOST
t "warn only" 0 "warning::dart-define STRIPE_PUBLISHABLE_KEY" '{"API_BASE_URL":"x","STRIPE_PUBLISHABLE_KEY":""}' --require API_BASE_URL --warn STRIPE_PUBLISHABLE_KEY
t "no values printed" 0 "ok" '{"API_BASE_URL":"supersecret"}' --require API_BASE_URL
printf '{"API_BASE_URL":"supersecret"}' >"$T/c.json"; "$D/check-dart-defines.sh" "$T/c.json" --require API_BASE_URL 2>&1 | grep -q supersecret && { echo "FAIL leaked"; fail=1; }
exit $fail
