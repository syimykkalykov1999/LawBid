#!/usr/bin/env bash
# Offline test of select-xcode.sh with a fake /Applications.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT; fail=0
mk() { rm -rf "$T/apps"; mkdir -p "$T/apps"; for n in "$@"; do mkdir -p "$T/apps/$n.app/Contents/Developer"; done; }
t() { local name="$1" want="$2" text="$3" min="$4"
  out="$(XCODE_APPS_DIR="$T/apps" XCODE_SELECT_CMD="echo SELECT" "$D/select-xcode.sh" ${min:+"$min"} 2>&1)"; got=$?
  if [ "$got" != "$want" ] || ! echo "$out" | grep -q -- "$text"; then echo "FAIL $name: exit $got (want $want): $out"; fail=1; else echo "ok   $name"; fi; }
mk Xcode_16.4 Xcode_26.0 Xcode_26.1 Xcode_26.2_beta Xcode_26.10
t "highest stable >= min (26.10 beats 26.1)" 0 "Xcode 26.10 selected" 26
mk Xcode_16.4 Xcode_26.2_beta Xcode_26.0_Release_Candidate
t "only betas/RC: none qualifies" 1 "no stable Xcode >= 26" 26
mk Xcode_16.4
t "too old" 1 "found: Xcode_16.4.app" 26
mk
t "no Xcode at all" 1 "no stable Xcode" 26
mk Xcode_26.0
t "passes <app>/Contents/Developer to xcode-select" 0 "SELECT .*Xcode_26.0.app/Contents/Developer" 26
exit $fail
