#!/usr/bin/env bash
# Row 170 (14.11): web-prune-releases.sh never removes an engine folder
# (releases/<engineRevision>/) that a kept release still points at, with stub
# aws and web-release.sh. GNU date (CI runs on Ubuntu).
#   bash scripts/deploy/web-prune-releases.test.sh
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }

OLD=$(date -u -d '-20 days' +%FT%TZ)
NEW=$(date -u -d '-1 hour' +%FT%TZ)
E1=af7e796e161ae0bb1ff0758c71a7105418bd9ded
E0=1111111111111111111111111111111111111111
EY=2222222222222222222222222222222222222222
mkdir -p "$T/d" "$T/bin" "$T/obj"
cp "$D/web-prune-releases.sh" "$T/d/"
cat >"$T/d/web-release.sh" <<'STUB'
#!/usr/bin/env bash
case "$1" in
  get) case "$3" in web_release) echo live1;; web_previous) echo prev1;; esac ;;
  delete) echo "KV-DELETE $3" >>"$LOG" ;;
esac
STUB
cat >"$T/bin/aws" <<'STUB'
#!/usr/bin/env bash
# Objects: $OBJ/<key with / as __> holds the LastModified date, <...>.body the content.
key() { echo "$1" | sed 's#/#__#g'; }
if [ "$1" = s3api ] && [ "$2" = list-objects-v2 ]; then
  case "$*" in *"--prefix releases/"*) cat "$OBJ/PREFIXES" ;; *) echo None ;; esac; exit 0
fi
if [ "$1" = s3api ] && [ "$2" = head-object ]; then
  k=""; while [ $# -gt 0 ]; do [ "$1" = --key ] && k="$2"; shift; done
  f="$OBJ/$(key "$k")"; [ -f "$f" ] && { cat "$f"; exit 0; }; exit 254
fi
if [ "$1" = s3 ] && [ "$2" = cp ]; then
  k="${3#s3://bkt/}"; f="$OBJ/$(key "$k").body"; [ -f "$f" ] && { cat "$f"; exit 0; }; exit 1
fi
if [ "$1" = s3 ] && [ "$2" = rm ]; then echo "RM ${3#s3://bkt/}" >>"$LOG"; exit 0; fi
exit 0
STUB
chmod +x "$T/d/web-release.sh" "$T/bin/aws"
export OBJ="$T/obj" LOG="$T/log"

setup() {
  find "$OBJ" -type f -delete
  : >"$LOG"
  printf 'releases/live1/\treleases/prev1/\treleases/old1/\treleases/%s/\treleases/%s/\treleases/%s/\n' "$E1" "$E0" "$EY" >"$OBJ/PREFIXES"
  for r in live1 prev1; do
    echo "$NEW" >"$OBJ/releases__${r}__index.html"
    printf '_flutter.loader.load({config:{entrypointBaseUrl:"v/%s/",canvasKitBaseUrl:"v/%s/canvaskit",assetBase:"v/%s/"},});' "$r" "$E1" "$r" >"$OBJ/releases__${r}__flutter_bootstrap.js.body"
  done
  echo "$OLD" >"$OBJ/releases__old1__index.html"
  echo "$OLD" >"$OBJ/releases__${E1}__engine-complete"
  echo "$OLD" >"$OBJ/releases__${E0}__engine-complete"
  echo "$NEW" >"$OBJ/releases__${EY}__engine-complete"
}
prune() { (PATH="$T/bin:$PATH" KEEP=1 MIN_AGE_DAYS=3 bash "$T/d/web-prune-releases.sh" bkt arn >"$T/out" 2>&1) || { cat "$T/out"; bad "prune exited non-zero"; }; }

setup; prune
grep -qx "RM releases/old1/" "$LOG" && ok "old release removed" || bad "old release not removed: $(cat "$LOG")"
grep -qx "RM releases/$E1/" "$LOG" && bad "engine in use was removed" || ok "engine in use (live + previous) kept"
grep -qx "RM releases/$E0/" "$LOG" && ok "unused old engine removed" || bad "unused old engine kept: $(cat "$T/out")"
grep -qx "KV-DELETE br_$E0" "$LOG" && ok "its br_ marker removed" || bad "br_ marker of the unused engine kept"
grep -qx "RM releases/$EY/" "$LOG" && bad "a young engine was removed" || ok "young unused engine kept"
grep -q "RM releases/live1/\|RM releases/prev1/" "$LOG" && bad "live/previous release removed" || ok "live and previous kept"

setup; rm "$OBJ/releases__prev1__flutter_bootstrap.js.body"; prune
grep -q "RM releases/$E0/\|RM releases/$E1/" "$LOG" && bad "an engine was removed although a kept loader was unreadable" || ok "unreadable kept loader: no engine removed"

[ "$fail" = 0 ] && echo "web-prune-releases: all checks passed" || { echo "web-prune-releases: some checks FAILED"; exit 1; }
