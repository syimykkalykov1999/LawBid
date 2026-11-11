#!/usr/bin/env bash
# web-font-base.sh switches the release to our own font path only when the
# live host really serves a font there (B-c13), and web-immutable.py writes
# that base into the loader config.
set -u
D="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"
cleanup() { rm -r "$T"; }
trap cleanup EXIT
cat >"$T/curl" <<'S'
#!/usr/bin/env bash
printf '%s' "$ANSWER"
S
chmod +x "$T/curl"
fail=0
t() { # name answer want_stdout [host]
  out="$(CURL="$T/curl" ANSWER="$2" FONT_PROBE_PATH="notosanssc/v37/x.woff2" bash "$D/web-font-base.sh" "${4-lawbid.dev}" /nowhere 2>/dev/null)"
  if [ "$out" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got '$out')"; fail=1; fi
}
t "font served -> /s/" "200 font/woff2" "/s/"
t "404 app page -> gstatic" "404 text/html" ""
t "200 html (SPA fallback) -> gstatic" "200 text/html" ""
t "no answer -> gstatic" "000 " ""
t "no host -> gstatic" "200 font/woff2" "" ""

# The probe path is read from the pinned engine when none is given.
mkdir -p "$T/sdk/bin/cache/flutter_web_sdk/lib/_engine/engine"
printf "    'notosanssc/v37/abc_DEF-1.4.woff2',\n" >"$T/sdk/bin/cache/flutter_web_sdk/lib/_engine/engine/font_fallback_data.dart"
cat >"$T/curl2" <<'S'
#!/usr/bin/env bash
for a in "$@"; do case "$a" in https://*) echo "$a" >"$URL_LOG" ;; esac; done
printf '200 font/woff2'
S
chmod +x "$T/curl2"
out="$(CURL="$T/curl2" URL_LOG="$T/url" bash "$D/web-font-base.sh" lawbid.dev "$T/sdk" 2>/dev/null)"
if [ "$out" = "/s/" ] && [ "$(cat "$T/url")" = "https://lawbid.dev/s/notosanssc/v37/abc_DEF-1.4.woff2" ]; then
  echo "ok   probe path comes from the engine data"
else
  echo "FAIL probe path (out='$out' url='$(cat "$T/url" 2>/dev/null)')"; fail=1
fi

# web-immutable.py: the base lands in the loader config; none = untouched.
mk() {
  rm -r "$T/b" 2>/dev/null
  mkdir -p "$T/b/canvaskit" "$T/b/assets"
  for f in main.dart.wasm main.dart.mjs main.dart.js; do : >"$T/b/$f"; done
  printf '_flutter.loader.load({serviceWorkerSettings:{}});' >"$T/b/flutter_bootstrap.js"
  printf 'var v="__LB_V__";' >"$T/b/boot_head.js"
}
mk
python3 "$D/web-immutable.py" "$T/b" abcdef1 /s/ >/dev/null
if grep -q 'fontFallbackBaseUrl:"/s/"' "$T/b/flutter_bootstrap.js"; then echo "ok   web-immutable writes fontFallbackBaseUrl"; else echo "FAIL web-immutable font base: $(cat "$T/b/flutter_bootstrap.js")"; fail=1; fi
mk
python3 "$D/web-immutable.py" "$T/b" abcdef1 "" >/dev/null
if grep -q 'fontFallbackBaseUrl' "$T/b/flutter_bootstrap.js"; then echo "FAIL empty base must leave the engine default"; fail=1; else echo "ok   no base, engine default (gstatic)"; fi
mk
if python3 "$D/web-immutable.py" "$T/b" abcdef1 'https://x/"+alert(1)+"' >/dev/null 2>&1; then
  echo "FAIL a quoted base must be refused"; fail=1
else
  echo "ok   odd base refused"
fi
exit "$fail"
