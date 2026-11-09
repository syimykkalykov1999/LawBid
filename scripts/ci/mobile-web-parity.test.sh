#!/usr/bin/env bash
# Offline test of mobile-web-parity.sh.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; T=$(mktemp -d "${TMPDIR:-/tmp}/parity.XXXXXX"); fail=0
run() { # name expected-exit files body labels
  printf '%b' "$3" > "$T/files"; printf '%b' "$4" > "$T/body"; printf '%b' "$5" > "$T/labels"
  "$D/mobile-web-parity.sh" "$T/files" "$T/body" "$T/labels" >/dev/null 2>&1
  got=$?; if [ "$got" != "$2" ]; then echo "FAIL $1: exit $got, want $2"; fail=1; else echo "ok   $1"; fi
}
F='apps/mobile/lib/features/cases/presentation/cases_screen.dart\n'
run "no app code changed" 0 'apps/api/src/x.ts\ndocs/a.md\n' '' ''
run "only generated / tests changed" 0 'apps/mobile/lib/features/a/data/x.g.dart\napps/mobile/test/a_test.dart\n' '' ''
run "feature code, body silent" 1 "$F" 'fix cases\n' ''
run "feature code, owner table present" 0 "$F" '| правка в приложении | правка в вебе |\n|---|---|\n| сортировка дел | то же |\n' ''
run "feature code, web section present" 0 "$F" 'Что сделано\n\n## Веб\nпроверено на lawbid.dev\n' ''
run "feature code, label web-n/a" 0 "$F" '' 'bug\nweb-n/a\n'
run "core code counts as feature code" 1 'apps/mobile/lib/core/network/dio.dart\n' 'x' ''
rm -rf "$T"; exit $fail
