#!/usr/bin/env bash
# B-c13 (owner list, 2026-11-09): where the Flutter web engine downloads its
# fallback Noto fonts (Chinese, Arabic, Hindi, ... the scripts the app does
# not bundle). Default: fonts.gstatic.com, which China and Iran block. When
# the live web host already serves the same files under /s/* (the CloudFront
# behavior of infra/modules/web, `font_fallback_proxy`), print "/s/" so the
# release loads them from our own domain; otherwise print nothing and the
# engine keeps its default. Asking the live host makes the order of
# `terraform apply` and the deploy irrelevant: before the apply the release
# simply stays on gstatic.
#
# The probe file is the first Simplified Chinese subset the pinned engine
# itself lists (font_fallback_data.dart), so a Flutter bump checks the paths
# the new engine will really ask for.
#
# Usage: web-font-base.sh <web host> <flutter root>
# Env (tests): CURL (default curl), FONT_PROBE_PATH (skip reading the SDK).
set -u
host="${1:-}"
root="${2:-}"
curl_bin="${CURL:-curl}"
if [ -z "$host" ]; then
  echo "web-font-base: no web host, fonts stay on fonts.gstatic.com" >&2
  exit 0
fi
probe="${FONT_PROBE_PATH:-}"
if [ -z "$probe" ]; then
  data="$root/bin/cache/flutter_web_sdk/lib/_engine/engine/font_fallback_data.dart"
  probe="$(grep -o "notosanssc/v[0-9]*/[A-Za-z0-9_.-]*\.woff2" "$data" 2>/dev/null | head -1)"
fi
if [ -z "$probe" ]; then
  echo "web-font-base: no probe font in the engine data, fonts stay on fonts.gstatic.com" >&2
  exit 0
fi
type="$("$curl_bin" -s -o /dev/null -m 20 -w '%{http_code} %{content_type}' "https://$host/s/$probe" 2>/dev/null || true)"
case "$type" in
  "200 font/"*)
    echo "web-font-base: https://$host/s/ serves the engine fonts" >&2
    echo "/s/"
    ;;
  *)
    echo "web-font-base: https://$host/s/ answered '$type', fonts stay on fonts.gstatic.com" >&2
    ;;
esac
exit 0
