#!/usr/bin/env bash
# Fair FIFO queue for heavy dev jobs (jest suites, tsc, eslint, docker, builds)
# so only ONE runs at a time across all workers/worktrees on this Mac.
#
#   scripts/dev/heavy.sh [--quiet] [--max-wait SECONDS] -- <command...>
#   scripts/dev/heavy.sh status      # who is running / waiting
#   scripts/dev/heavy.sh clean       # drop dead tickets and a dead lock now
#
# How it works
#   - You take a ticket in /tmp/lawbid-heavy.queue/ (name = millisecond
#     timestamp + pid). The lowest ticket runs first (first come, first served).
#   - The running job holds /tmp/lawbid-heavy.lock (a directory, the same name
#     the old `until mkdir /tmp/lawbid-heavy.lock` one-liner uses, so old
#     callers and this script exclude each other). Our lock has a `pid` file.
#   - A ticket or lock whose owner process is gone (crash, kill -9, closed
#     terminal) is removed by whoever waits next, so a dead worker never
#     blocks the queue. An old-style lock without a pid file cannot be
#     checked; it is treated as stale after HEAVY_STALE_MIN minutes
#     (default 120).
#   - The command's exit code is passed through. Ctrl-C / kill releases.
# Works with macOS bash 3.2.
set -u

Q=${HEAVY_QUEUE_DIR:-/tmp/lawbid-heavy.queue}
LOCK=${HEAVY_LOCK_DIR:-/tmp/lawbid-heavy.lock}
# Second lane (owner 2026-10-25: up to 2 heavy jobs when RAM allows, Mac has 16 GB):
# a job may run in LOCK2 when lane 1 is busy, free RAM >= LANE2_MIN_RAM %, and
# neither job is a `git commit` (pre-commit lint uses an 8 GB heap).
LOCK2=${LOCK}2
LANE2_MIN_RAM=${HEAVY_LANE2_MIN_RAM:-65}
STALE_MIN=${HEAVY_STALE_MIN:-120}
POLL=${HEAVY_POLL_SECONDS:-3}

alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
now_ms() { perl -MTime::HiRes=time -e 'printf "%.0f", time()*1000'; }
say() { [ "${QUIET:-0}" = 1 ] || echo "[heavy] $*" >&2; }

lock_pid() { cat "${1:-$LOCK}/pid" 2>/dev/null; }
free_ram_pct() { memory_pressure 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2);print int($2)}'; }
is_commit() { case "$1" in *"git commit"*) return 0;; *) return 1;; esac; }
lane2_ok() {
  local r; r=$(free_ram_pct); [ -n "$r" ] || return 1
  [ "$r" -ge "$LANE2_MIN_RAM" ] || return 1
  # Two git commits (pre-commit lint on staged files, ~3-4 GB each) only when RAM is plentiful.
  if is_commit "$*" || is_commit "$(cat "$LOCK/cmd" 2>/dev/null)"; then
    [ "$r" -ge "${HEAVY_LANE2_COMMIT_MIN_RAM:-70}" ] || return 1
  fi
  return 0
}

# Age of the lock directory in minutes.
lock_age_min() {
  local m
  m=$(stat -f %m "$LOCK" 2>/dev/null) || { echo 0; return; }
  echo $(( ( $(date +%s) - m ) / 60 ))
}

# Remove dead tickets and a dead lock. Safe to call from many processes.
sweep() {
  local t pid
  for t in "$Q"/*; do
    [ -e "$t" ] || continue
    pid=$(head -n1 "$t" 2>/dev/null)
    if ! alive "$pid"; then rm -f "$t"; say "dropped dead ticket $(basename "$t")"; fi
  done
  local L
  for L in "$LOCK" "$LOCK2"; do
    if [ -d "$L" ]; then
      pid=$(lock_pid "$L")
      if [ -n "$pid" ]; then
        alive "$pid" || { rm -rf "$L" 2>/dev/null; say "released dead lock (pid $pid)"; }
      elif [ "$(lock_age_min)" -ge "$STALE_MIN" ]; then
        rm -rf "$L" 2>/dev/null; say "released old-style lock older than ${STALE_MIN} min"
      fi
    fi
  done
}

first_ticket() { ls "$Q" 2>/dev/null | sort | head -n1; }

status() {
  sweep
  if [ -d "$LOCK" ]; then
    echo "running: pid $(lock_pid) $(cat "$LOCK/cmd" 2>/dev/null) (lock age $(lock_age_min) min)"
  else
    echo "running: nobody"
  fi
  if [ -d "$LOCK2" ]; then
    echo "lane 2: pid $(lock_pid "$LOCK2") $(cat "$LOCK2/cmd" 2>/dev/null)"
  fi
  echo "free RAM: $(free_ram_pct)% (lane 2 needs >= ${LANE2_MIN_RAM}%)"
  local n=0 t
  for t in $(ls "$Q" 2>/dev/null | sort); do
    n=$((n+1)); echo "queue #$n: pid $(head -n1 "$Q/$t") $(sed -n 2p "$Q/$t")"
  done
  [ $n -gt 0 ] || echo "queue: empty"
}

QUIET=0
MAXWAIT=0
mkdir -p "$Q"
while [ $# -gt 0 ]; do
  case "$1" in
    status) status; exit 0 ;;
    clean) sweep; exit 0 ;;
    --quiet) QUIET=1; shift ;;
    --max-wait) MAXWAIT=$2; shift 2 ;;
    --) shift; break ;;
    -h|--help) sed -n 2,19p "$0"; exit 0 ;;
    *) break ;;
  esac
done
[ $# -gt 0 ] || { echo "usage: heavy.sh [--quiet] [--max-wait S] -- <command...>" >&2; exit 2; }

TICKET="$Q/$(now_ms)-$$"
printf '%s\n%s\n' "$$" "$*" > "$TICKET"
HAVE_LOCK=0
release() {
  if [ "$HAVE_LOCK" = 1 ]; then rm -rf "$LOCK"; fi
  if [ "$HAVE_LOCK" = 2 ]; then rm -rf "$LOCK2"; fi
  rm -f "$TICKET"
}
trap release EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

start=$(date +%s)
lastsay=0
while :; do
  sweep
  me=$(basename "$TICKET"); first=$(first_ticket); second=$(ls "$Q" 2>/dev/null | sort | sed -n 2p)
  if [ "$first" = "$me" ] && mkdir "$LOCK" 2>/dev/null; then
    HAVE_LOCK=1
    printf '%s\n' "$$" > "$LOCK/pid"
    printf '%s\n' "$*" > "$LOCK/cmd"
    rm -f "$TICKET"   # the ticket only orders the queue; a lane holder must not block the next waiter
    break
  fi
  if [ -d "$LOCK" ] && { [ "$first" = "$me" ] || [ "$second" = "$me" ]; } && lane2_ok "$*" && mkdir "$LOCK2" 2>/dev/null; then
    HAVE_LOCK=2
    printf '%s\n' "$$" > "$LOCK2/pid"
    printf '%s\n' "$*" > "$LOCK2/cmd"
    rm -f "$TICKET"
    say "lane 2 (free RAM $(free_ram_pct)%)"
    break
  fi
  nowt=$(date +%s)
  if [ $(( nowt - lastsay )) -ge 60 ]; then
    pos=$(ls "$Q" | sort | grep -n "^$(basename "$TICKET")\$" | cut -d: -f1)
    say "waiting, place ${pos:-?} in the queue"
    lastsay=$nowt
  fi
  if [ "$MAXWAIT" -gt 0 ] && [ $(( nowt - start )) -ge "$MAXWAIT" ]; then
    say "gave up after ${MAXWAIT}s"; exit 124
  fi
  sleep "$POLL"
done

say "start: $*"
"$@"
exit $?
