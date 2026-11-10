#!/usr/bin/env bash
# Runs the admin audit in small route groups, each through the shared heavy
# queue (scripts/dev/heavy.sh), so one long audit never holds the Mac's heavy
# lane for hours. A group = one top-level section with its [id] pages, so the
# detail pages find their links in the same run.
set -u
cd "$(dirname "$0")"
app=../../apps/admin/src/app/'(app)'
groups=$(cd "$app" && find . -name page.tsx | sed -E 's#^\./##; s#/?page\.tsx$##; s#/.*##' | sort -u | sed 's#^#/#; s#^/$#/#')
per=${CHUNK:-6}
batch=()
# Mac safety (owner 2026-11-08 after the 19:16 freeze): wait for load < 8
# and >= 10 GB free disk before each group.
ok_to_run() {
  local load free
  load=$(sysctl -n vm.loadavg | awk '{print int($2)}')
  free=$(df -g / | awk 'NR==2{print $4}')
  [ "$load" -lt 8 ] && [ "$free" -ge 10 ]
}
run() {
  [ ${#batch[@]} -eq 0 ] && return
  until ok_to_run; do sleep 30; done
  ROUTES=$(IFS=,; echo "${batch[*]}") nice -n 15 ../../scripts/dev/heavy.sh -- timeout 3600 npx playwright test admin || true
  batch=()
}
# SKIP_DONE=1: leave out sections already in results/admin.jsonl.
done_list=""
if [ "${SKIP_DONE:-0}" = 1 ] && [ -f results/admin.jsonl ]; then
  done_list=$(node -e 'const s=new Set();for(const l of require("fs").readFileSync("results/admin.jsonl","utf8").split("\n")){if(!l)continue;const p=JSON.parse(l).page;s.add("/"+(p.split("/")[1]||""))}console.log([...s].join(" "))')
fi
for g in $groups; do
  case " $done_list " in *" $g "*) continue;; esac
  batch+=("$g")
  [ ${#batch[@]} -ge "$per" ] && run
done
run
