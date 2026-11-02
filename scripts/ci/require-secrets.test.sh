#!/usr/bin/env bash
# Offline test of require-secrets.sh.
set -u
D="$(cd "$(dirname "$0")" && pwd)"; fail=0
t() { # name want-exit want-text env-assignments... -- args...
  local name="$1" want="$2" text="$3"; shift 3
  local envs=(); while [ "$1" != "--" ]; do envs+=("$1"); shift; done; shift
  out="$(env -i PATH="$PATH" ${envs[@]+"${envs[@]}"} "$D/require-secrets.sh" "$@" 2>&1)"; got=$?
  if [ "$got" != "$want" ] || ! echo "$out" | grep -q -- "$text"; then echo "FAIL $name: exit $got (want $want): $out"; fail=1; else echo "ok   $name"; fi
}
t "all present" 0 "ok" A=1 B=x -- A B
t "empty is missing" 1 "B is empty" A=1 B= -- A B
t "whitespace only is missing" 1 "B is empty" A=1 "B=  " -- A B
t "unset is missing" 1 "A is empty" -- A
t "lists every missing name" 1 "A is empty" A= B= -- A B
t "lists every missing name (second)" 1 "B is empty" A= B= -- A B
t "count ignores optional names" 0 "ok   1 required" A=1 -- A ?X ?Y
t "optional only warns" 0 "warning::C is empty" A=1 -- A ?C
t "value never printed" 0 "ok" A=topsecret -- A
t "bad name rejected" 2 "bad name" -- 'A;rm'
t "usage" 2 "usage" --
out="$(env -i PATH="$PATH" A=topsecret "$D/require-secrets.sh" A 2>&1)"; echo "$out" | grep -q topsecret && { echo "FAIL leaked value"; fail=1; }
exit $fail
