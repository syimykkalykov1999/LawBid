#!/usr/bin/env bash
Q=/tmp/lawbid-heavy.queue
for i in $(seq 1 2160); do
  for L in /tmp/lawbid-heavy.lock /tmp/lawbid-heavy.lock2; do
    p=$(cat "$L/pid" 2>/dev/null)
    [ -n "$p" ] && for t in $(grep -l "^$p\$" "$Q"/* 2>/dev/null); do rm -f "$t"; echo "$(date +%H:%M) dropped holder ticket $t"; done
  done
  for t in "$Q"/*; do [ -e "$t" ] || continue; p=$(head -1 "$t"); kill -0 "$p" 2>/dev/null || { rm -f "$t"; echo "$(date +%H:%M) dropped dead ticket $t"; }; done
  sleep 10
done
echo "sweeper ended after 6 h"
