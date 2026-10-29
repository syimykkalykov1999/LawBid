#!/usr/bin/env bash
# Every 20 s: free RAM < 25 % → kill the single biggest jest/tsc/eslint/flutter/dart/terraform process; log everything to /tmp/lawbid-ramguard.log
while :; do
  r=$(memory_pressure | awk -F': ' '/free percentage/{gsub("%","",$2);print int($2)}')
  if [ "${r:-100}" -lt 25 ]; then
    p=$(ps -axo rss,pid,command | grep -E "jest|tsc --noEmit|eslint|flutter|dart |terraform" | grep -v grep | sort -rn | head -1)
    pid=$(echo "$p" | awk '{print $2}'); [ -n "$pid" ] && kill "$pid" 2>/dev/null
    echo "$(date +%H:%M:%S) RAM ${r}% — killed pid $pid: $(echo "$p" | cut -c1-90)" >> /tmp/lawbid-ramguard.log
  elif [ "${r:-100}" -lt 40 ]; then echo "$(date +%H:%M:%S) RAM ${r}% low — no new launches" >> /tmp/lawbid-ramguard.log; fi
  sleep 20
done
