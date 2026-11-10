#!/usr/bin/env bash
# Offline test of web-size-budget.sh (raw sizes stand in for brotli).
set -u
D="$(cd "$(dirname "$0")" && pwd)"; T=$(mktemp -d "${TMPDIR:-/tmp}/web-size.XXXXXX"); fail=0
mk() { mkdir -p "$T/$1/canvaskit"; for f in main.dart.wasm main.dart.js canvaskit/canvaskit.wasm canvaskit/skwasm.wasm canvaskit/skwasm.js; do head -c "$2" /dev/zero > "$T/$1/$f"; done; }
budget() { printf '{"app_brotli_bytes_max":%s,"total_brotli_bytes_max":%s,"files":{"app":["main.dart.wasm","main.dart.js"],"engine":["canvaskit/canvaskit.wasm","canvaskit/skwasm.wasm","canvaskit/skwasm.js"]}}' "$1" "$2" > "$T/$3.json"; }
run() { # name expected-exit dir budget
  WEB_SIZE_NO_BROTLI=1 "$D/web-size-budget.sh" "$T/$3" "$T/$4.json" >"$T/out.txt" 2>&1
  got=$?; if [ "$got" != "$2" ]; then echo "FAIL $1: exit $got, want $2"; cat "$T/out.txt"; fail=1; else echo "ok   $1"; fi
}
mk small 100; budget 200 500 ok; budget 199 500 appover; budget 200 499 totalover
run "within both budgets" 0 small ok
run "our code over budget" 1 small appover
run "first load over budget" 1 small totalover
rm "$T/small/canvaskit/skwasm.js"; run "a budgeted file missing" 1 small ok
grep -Eq "APP \(our code\) +200 B" "$T/out.txt" || { echo "FAIL numbers printed"; fail=1; }
rm -rf "$T"; exit $fail
