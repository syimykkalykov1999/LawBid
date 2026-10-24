#!/bin/sh
# Owner 2026-10-24: checks that a public media URL (Cloudflare R2 behind
# media.lawbid.dev) is cached, immutable, range-capable and CORS-ready.
#
#   sh scripts/ops/verify-r2-media.sh https://media.lawbid.dev/avatar/<userId>/<fileId>.webp
#   ORIGIN=https://admin.lawbid.dev sh scripts/ops/verify-r2-media.sh <url>
#
# Checks (exit code 1 when any fails):
#   1. second request: cf-cache-status = HIT   (Cache Rule «Cache Everything»)
#   2. Cache-Control contains immutable        (the object was uploaded with it)
#   3. Accept-Ranges is present                (video / audio seeking)
#   4. a request with Origin gets Access-Control-Allow-Origin back, and the
#      preflight (OPTIONS, PUT) is answered   (R2 bucket CORS policy)
# Only GET/HEAD/OPTIONS are sent: nothing is written or deleted.
set -u

url="${1:-}"
origin="${ORIGIN:-https://lawbid.dev}"
if [ -z "$url" ]; then
  echo "usage: $0 <public-media-url>   (ORIGIN=https://... to test another origin)" >&2
  exit 2
fi

fail=0
ok() { printf 'OK    %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

# Lower-cased response headers of a request ($@ = extra curl args).
headers() { curl -s -o /dev/null -D - --max-time 20 "$@" | tr -d '\r' | tr 'A-Z' 'a-z'; }
header() { printf '%s\n' "$1" | sed -n "s/^$2: *//p" | head -n 1; }

# Warm the edge, then look at the second answer.
headers "$url" >/dev/null
second=$(headers "$url")
status=$(printf '%s\n' "$second" | sed -n '1s/^http\/[0-9.]* \([0-9]*\).*/\1/p')
if [ "$status" != "200" ]; then
  bad "GET answered HTTP ${status:-none} (expected 200): is the URL right and the object public?"
fi

hit=$(header "$second" 'cf-cache-status')
if [ "$hit" = "hit" ]; then
  ok "cf-cache-status: HIT on the second request"
else
  bad "cf-cache-status is '${hit:-missing}' on the second request (expected HIT): add the Cache Rule (Cache Everything, Edge TTL 1 day) for media.lawbid.dev"
fi

cc=$(header "$second" 'cache-control')
case "$cc" in
  *immutable*) ok "Cache-Control: $cc" ;;
  *) bad "Cache-Control is '${cc:-missing}' (expected ... immutable): browser TTL must be «Respect origin» and the object uploaded with the immutable header" ;;
esac

ar=$(header "$second" 'accept-ranges')
if [ -n "$ar" ]; then
  ok "Accept-Ranges: $ar"
else
  bad "Accept-Ranges header missing"
fi

cors=$(headers -H "Origin: $origin" "$url")
acao=$(header "$cors" 'access-control-allow-origin')
if [ "$acao" = "$origin" ] || [ "$acao" = "*" ]; then
  ok "Access-Control-Allow-Origin: $acao (for Origin $origin)"
else
  bad "no Access-Control-Allow-Origin for Origin $origin (got '${acao:-none}'): set the bucket CORS policy, then purge the media.lawbid.dev cache"
fi

pre=$(headers -X OPTIONS -H "Origin: $origin" -H 'Access-Control-Request-Method: PUT' -H 'Access-Control-Request-Headers: content-type,cache-control' "$url")
allow=$(header "$pre" 'access-control-allow-methods')
case "$allow" in
  *put*) ok "preflight allows methods: $allow" ;;
  *) bad "preflight does not allow PUT (access-control-allow-methods='${allow:-none}'): R2 browser uploads need PUT, GET, HEAD in the CORS policy" ;;
esac

if [ "$fail" = 0 ]; then
  echo "All checks passed."
else
  echo "Some checks failed: see docs/runbooks/DNS_TO_CLOUDFLARE.md (R2 checklist)." >&2
fi
exit "$fail"
