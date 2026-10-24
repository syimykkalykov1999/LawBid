#!/usr/bin/env bash
# LawBid on-device performance suite (docs/perf/APP_DEVICE_PERF.md).
#
#   apps/mobile/tool/perf/run_device_perf.sh <device-id> [label]
#
# 1. checks the local API answers (the suite signs in with the dev seed's
#    test attorney, or a demo invite: PERF_DEMO_CODE) - never a real account;
# 2. cold start of the real process, COLD_RUNS times, with
#    `flutter run --profile --trace-startup` (engine start -> first frame);
# 3. builds PROFILE and runs integration_test/perf/perf_suite_test.dart with
#    `flutter drive`;
# 4. prints the Markdown summary, keeps JSON + Markdown in
#    build/perf/<label>/ and exits 1 when a budget failed.
#
# Environment (all optional):
#   API_BASE_URL   API as the PHONE sees it. Defaults: Android emulator
#                  http://10.0.2.2:3000/api/v1, Android phone (adb reverse)
#                  and iOS simulator http://127.0.0.1:3000/api/v1, iPhone
#                  http://<this Mac's LAN address>:3000/api/v1
#   PERF_DEMO_CODE demo invite code instead of the seed attorney
#   PERF_PHONE / PERF_PASSWORD   other seed login
#   COLD_RUNS      cold starts to take the median of (default 3, 0 = skip)
#   PERF_NO_FAIL=1 exit 0 even when a budget failed
set -euo pipefail

DEVICE="${1:?usage: run_device_perf.sh <device-id> [label]}"
LABEL="${2:-$(date +%Y%m%d-%H%M%S)}"
cd "$(dirname "$0")/../.."

OUT="$PWD/build/perf/$LABEL"
mkdir -p "$OUT"

ADB="$(command -v adb || true)"
[ -z "$ADB" ] && [ -x "$HOME/Library/Android/sdk/platform-tools/adb" ] &&
  ADB="$HOME/Library/Android/sdk/platform-tools/adb"

# --- what is the device ---------------------------------------------------
INFO="$(flutter devices --machine | python3 -c '
import json, sys
for d in json.load(sys.stdin):
    if d["id"] == sys.argv[1]:
        print(d["targetPlatform"], d.get("emulator", False), d["name"], sep="|")
        break
' "$DEVICE")"
[ -n "$INFO" ] || { echo "device $DEVICE not found (flutter devices)"; exit 2; }
TARGET="${INFO%%|*}"; REST="${INFO#*|}"; EMU="${REST%%|*}"; NAME="${REST#*|}"
case "$TARGET" in
  ios) PLATFORM=ios; BUNDLE=com.lawbid.lawbid.dev ;;
  android*) PLATFORM=android; BUNDLE=com.lawbid.lawbid.dev ;;
  *) echo "unsupported platform $TARGET"; exit 2 ;;
esac
echo "perf: $NAME ($PLATFORM, emulator=$EMU)"

# --- API address the phone can reach ---------------------------------------
if [ -z "${API_BASE_URL:-}" ]; then
  if [ "$PLATFORM" = android ] && [ "$EMU" = True ]; then
    API_BASE_URL="http://10.0.2.2:3000/api/v1"
  elif [ "$PLATFORM" = android ]; then
    [ -n "$ADB" ] && "$ADB" -s "$DEVICE" reverse tcp:3000 tcp:3000 >/dev/null
    API_BASE_URL="http://127.0.0.1:3000/api/v1"
  elif [ "$EMU" = True ]; then
    API_BASE_URL="http://127.0.0.1:3000/api/v1"
  else
    LAN="$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)"
    [ -n "$LAN" ] || { echo "no LAN address; set API_BASE_URL"; exit 2; }
    API_BASE_URL="http://$LAN:3000/api/v1"
  fi
fi
echo "perf: API as the phone sees it: $API_BASE_URL"
HOST_URL="$(echo "$API_BASE_URL" | sed -E 's#//[^:/]+#//127.0.0.1#')"
CODE="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$HOST_URL/config/bootstrap" || true)"
if [ "$CODE" = "000" ] || [ -z "$CODE" ]; then
  echo "perf: the API does not answer at $HOST_URL - start it first (apps/api)."
  exit 3
fi

# --- dart-define file (build/ is ignored by git) ---------------------------
CFG="$OUT/perf.json"
python3 - "$CFG" "$API_BASE_URL" <<'PY'
import json, os, sys
src = "config/dev.json" if os.path.exists("config/dev.json") else "config/dev.example.json"
cfg = json.load(open(src))
cfg["API_BASE_URL"] = sys.argv[2]
json.dump(cfg, open(sys.argv[1], "w"), indent=2)
PY

DEFS=(
  "--dart-define-from-file=$CFG"
  "--dart-define=PERF_PLATFORM=$PLATFORM"
  "--dart-define=PERF_MODEL=$NAME"
)
[ -n "${PERF_DEMO_CODE:-}" ] && DEFS+=("--dart-define=PERF_DEMO_CODE=$PERF_DEMO_CODE")
[ -n "${PERF_PHONE:-}" ] && DEFS+=("--dart-define=PERF_PHONE=$PERF_PHONE")
[ -n "${PERF_PASSWORD:-}" ] && DEFS+=("--dart-define=PERF_PASSWORD=$PERF_PASSWORD")

# --- 1. cold starts of the real process --------------------------------------
COLD_RUNS="${COLD_RUNS:-3}"
FIRST=(); INIT=()
for ((i = 1; i <= COLD_RUNS; i++)); do
  echo "perf: cold start $i/$COLD_RUNS"
  rm -f build/start_up_info.json
  if flutter run --profile --trace-startup --no-resident -d "$DEVICE" \
      --flavor dev -t lib/main_dev.dart "${DEFS[@]}" >"$OUT/cold_$i.log" 2>&1 &&
      [ -f build/start_up_info.json ]; then
    cp build/start_up_info.json "$OUT/start_up_info_$i.json"
    FIRST+=("$(python3 -c 'import json;d=json.load(open("build/start_up_info.json"));print(d.get("timeToFirstFrameRasterizedMicros",d.get("timeToFirstFrameMicros",0))/1000)')")
    INIT+=("$(python3 -c 'import json;print(json.load(open("build/start_up_info.json")).get("timeToFrameworkInitMicros",0)/1000)')")
  else
    echo "perf: cold start $i failed (see $OUT/cold_$i.log)"
  fi
  # A truly cold process: stop the app between runs.
  if [ "$PLATFORM" = android ] && [ -n "$ADB" ]; then
    "$ADB" -s "$DEVICE" shell am force-stop "$BUNDLE" || true
  fi
done
median() { printf '%s\n' "$@" | sort -n | awk '{a[NR]=$1} END{if(NR) print a[int((NR+1)/2)]}'; }
if [ ${#FIRST[@]} -gt 0 ]; then
  DEFS+=("--dart-define=PERF_NATIVE_FIRST_FRAME_MS=$(median "${FIRST[@]}")")
  DEFS+=("--dart-define=PERF_NATIVE_FRAMEWORK_INIT_MS=$(median "${INIT[@]}")")
  echo "perf: native cold start, median first frame $(median "${FIRST[@]}") ms"
fi

# --- 2. the suite ---------------------------------------------------------------
set +e
PERF_OUT="$OUT" flutter drive --profile --flavor dev -t lib/main_dev.dart \
  "${DEFS[@]}" \
  --driver=test_driver/perf_suite_driver.dart \
  --target=integration_test/perf/perf_suite_test.dart \
  -d "$DEVICE" 2>&1 | tee "$OUT/drive.log"
DRIVE=${PIPESTATUS[0]}
set -e

# --- 3. the phone's own copy (best effort; the driver already saved one) ----
if [ "$PLATFORM" = ios ] && [ "$EMU" = False ]; then
  xcrun devicectl device copy from --device "$DEVICE" \
    --domain-type appDataContainer --domain-identifier "$BUNDLE" \
    --source Documents/lb_perf --destination "$OUT/on_device" \
    >/dev/null 2>&1 || true
fi

if [ ! -f "$OUT/perf_result.json" ]; then
  echo "perf: no result was produced (drive exit $DRIVE); see $OUT/drive.log"
  exit 1
fi
echo
echo "perf: results in $OUT (perf_result.json, perf_result.md)"
PASSED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["passed"])' "$OUT/perf_result.json")"
echo "perf: budgets passed = $PASSED"
if [ "$PASSED" != "True" ] && [ -z "${PERF_NO_FAIL:-}" ]; then exit 1; fi
