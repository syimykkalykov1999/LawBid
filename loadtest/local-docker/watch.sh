#!/usr/bin/env bash
# Heat / RAM / disk watcher for the laptop load runs (owner rules 2026-10-28):
#  * pause the load when Package temp >= 97 C for 3 consecutive guard minutes
#    (~/laptop-guard.log) or any reading (guard or own 10 s sample) hits 100 C;
#    resume when it is below 85 C;
#  * STOP the load when RAM available < 6 GB or disk free < 50 GB.
# "The load" = running containers whose name starts with lt-k6 (and, during
# seeding, lawbid-lt-postgres-1 when WATCH_PG=1).
# Log: $RESULTS/watch.log; peak temp: $RESULTS/peak-temp (RESULTS default ~/loadtest/results).
# Start: systemd-run --user --unit=lt-watch -E WATCH_PG=1 bash loadtest/local-docker/watch.sh
R="${RESULTS:-$HOME/loadtest/results}"; mkdir -p "$R"; LOG="$R/watch.log"; PEAK="$R/peak-temp"
paused=0
targets() { docker ps --format '{{.Names}}' | grep -E '^lt-k6' ; [ "${WATCH_PG:-0}" = 1 ] && echo lawbid-lt-postgres-1; }
while true; do
  t=$(sensors 2>/dev/null | awk '/Package id 0/{gsub(/[+°C]/,"",$4); print int($4)}'); t=${t:-0}
  p=$(cat $PEAK 2>/dev/null || echo 0); [ "$t" -gt "$p" ] && echo "$t" > $PEAK
  avail=$(free -g | awk '/Mem/{print $7}'); disk=$(df -BG / | awk 'NR==2{gsub("G","",$4); print $4}')
  hot3=$(tail -3 ~/laptop-guard.log | awk '{split($2,a,"=");gsub("C","",a[2]); if (a[2]+0>=97) n++} END{print (n==3)?1:0}')
  if [ "$avail" -lt 6 ] || [ "$disk" -lt 50 ]; then
    echo "$(date +%T) STOP ram=${avail}G disk=${disk}G" >> $LOG
    for c in $(docker ps --format '{{.Names}}' | grep -E '^lt-k6'); do docker stop -t 5 "$c" >/dev/null; done
  elif [ $paused = 0 ] && { [ "$hot3" = 1 ] || [ "$t" -ge 100 ]; }; then
    echo "$(date +%T) PAUSE temp=${t}C hot3=$hot3" >> $LOG
    for c in $(targets); do docker pause "$c" >/dev/null 2>&1; done; paused=1
  elif [ $paused = 1 ] && [ "$t" -lt 85 ]; then
    echo "$(date +%T) RESUME temp=${t}C" >> $LOG
    for c in $(docker ps --filter status=paused --format '{{.Names}}'); do docker unpause "$c" >/dev/null 2>&1; done; paused=0
  fi
  sleep 10
done
