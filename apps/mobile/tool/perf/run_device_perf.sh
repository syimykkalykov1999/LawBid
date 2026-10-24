#!/usr/bin/env bash
# LawBid on-device performance suite (docs/perf/APP_DEVICE_PERF.md).
#
#   apps/mobile/tool/perf/run_device_perf.sh <device-id> [label]
#
# 1. checks the local API answers (the suite signs in with the perf attorney
#    from `npm run seed:perf --workspace apps/api`, +12125550190, or a demo
#    invite: PERF_DEMO_CODE) - never a real account. Run the seed first (it
#    also clears that account's old sessions, one device at a time);
#    reels play only with the fake Bunny running (apps/api/tools/fake-bunny.mjs
#    with FAKE_BUNNY_DIR=apps/api/.fake-bunny);
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
#   PERF_ONLY      run only some scenarios: feed,reels,search,chats,cases,taps
#   COLD_RUNS      cold starts to take the median of (default 3, 0 = skip)
#   PERF_ROUNDS    run the scroll scenarios N times in a row (default 1); the
#                  report gives the RSS at the end of each round and a
#                  warm-up / leak verdict (needs 3)
#   PERF_MEDIA_HOST  address of the Mac the PHONE can reach MinIO (:9000) and
#                  the fake Bunny (:4010) at. Default for a physical iPhone:
#                  the Mac's LAN address (the API's media links point at
#                  127.0.0.1 otherwise and no photo or video loads). The
#                  script then starts a SECOND copy of the built API on port
#                  3001 with S3_ENDPOINT / DEV_FAKE_BUNNY_HOST set to that
#                  address (the API on :3000 is not touched) and stops it
#                  at the end. Android with adb reverse needs none of this.
#   PERF_VIA_USB=1 physical iPhone only: reach the Mac through the USB cable
#                  (the Mac's address on the CoreDevice tunnel, fd..::2)
#                  instead of Wi-Fi. iOS blocks Wi-Fi/LAN addresses for an app
#                  until someone taps "Allow" on its Local Network prompt, and
#                  `flutter drive` uninstalls the app every run, which wipes
#                  that permission; the cable tunnel is not "local network",
#                  so no tap is needed. A second fake Bunny (IPv6, :4011) is
#                  started next to the second API for the videos.
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
    # The dev fake Bunny (reels): localhost:4010 on the phone = the Mac's.
    [ -n "$ADB" ] && "$ADB" -s "$DEVICE" reverse tcp:4010 tcp:4010 >/dev/null
  elif [ "$EMU" = True ]; then
    API_BASE_URL="http://127.0.0.1:3000/api/v1"
  else
    if [ -n "${PERF_VIA_USB:-}" ]; then
      USB6="$(ifconfig | awk '/inet6 fd/ {print $2; exit}')"
      [ -n "$USB6" ] || { echo "no USB tunnel address (is the phone unlocked and trusted?)"; exit 2; }
      LAN="[$USB6]"
      BUNNY_PORT=4011
      FAKE_BUNNY_V6=1
    else
      LAN="$(ipconfig getifaddr en0 || ipconfig getifaddr en1 || true)"
      [ -n "$LAN" ] || { echo "no LAN address; set API_BASE_URL"; exit 2; }
    fi
    API_BASE_URL="http://$LAN:3000/api/v1"
    PERF_MEDIA_HOST="${PERF_MEDIA_HOST:-$LAN}"
  fi
fi

# --- media the phone can reach: a second API copy with LAN media links ------
SIDE_API_PID=""
BUNNY_PID=""
BUNNY_PORT="${BUNNY_PORT:-4010}"
if [ -n "${PERF_MEDIA_HOST:-}" ]; then
  API_DIR="$PWD/../api"
  SIDE_PORT=3001
  if [ -f "$API_DIR/dist/src/main.js" ]; then
    echo "perf: media host $PERF_MEDIA_HOST: starting a second API on :$SIDE_PORT"
    (cd "$API_DIR" && PORT=$SIDE_PORT S3_ENDPOINT="http://$PERF_MEDIA_HOST:9000" \
      DEV_FAKE_BUNNY_HOST="$PERF_MEDIA_HOST:$BUNNY_PORT" \
      exec node dist/src/main.js) >"$OUT/side_api.log" 2>&1 &
    SIDE_API_PID=$!
    if [ -n "${FAKE_BUNNY_V6:-}" ]; then
      # The cable tunnel is IPv6; the dev fake Bunny on :4010 is IPv4 only.
      (cd "$API_DIR" && FAKE_BUNNY_PORT=$BUNNY_PORT FAKE_BUNNY_HOST=:: \
        FAKE_BUNNY_DIR="${FAKE_BUNNY_DIR:-$API_DIR/.fake-bunny}" \
        exec node tools/fake-bunny.mjs) >"$OUT/side_bunny.log" 2>&1 &
      BUNNY_PID=$!
    fi
    trap '[ -n "$SIDE_API_PID" ] && kill "$SIDE_API_PID" 2>/dev/null; [ -n "$BUNNY_PID" ] && kill "$BUNNY_PID" 2>/dev/null; true' EXIT
    API_BASE_URL="http://$PERF_MEDIA_HOST:$SIDE_PORT/api/v1"
    for _ in $(seq 1 60); do
      [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' \
        "http://127.0.0.1:$SIDE_PORT/api/v1/config/bootstrap")" = 200 ] && break
      sleep 1
    done
  else
    echo "perf: apps/api/dist is not built (npm run build --workspace apps/api); media links stay on 127.0.0.1"
  fi
fi
echo "perf: API as the phone sees it: $API_BASE_URL"
HOST_URL="$(echo "$API_BASE_URL" | sed -E 's#//(\[[^]]*\]|[^:/]+)#//127.0.0.1#')"
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
[ -n "${PERF_ROUNDS:-}" ] && DEFS+=("--dart-define=PERF_ROUNDS=$PERF_ROUNDS")
[ -n "${PERF_ONLY:-}" ] && DEFS+=("--dart-define=PERF_ONLY=$PERF_ONLY")
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
  # Never "no result": leave a stub that says why.
  echo "perf: no result was produced (drive exit $DRIVE); see $OUT/drive.log"
  printf '{"passed": false, "error": "no result (flutter drive exit %s)"}\n' \
    "$DRIVE" >"$OUT/perf_result.json"
  printf '# LawBid on-device performance\n\nNo result: flutter drive exited with %s. See drive.log.\n' \
    "$DRIVE" >"$OUT/perf_result.md"
  exit 1
fi
echo
echo "perf: results in $OUT (perf_result.json, perf_result.md)"
PASSED="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["passed"])' "$OUT/perf_result.json")"
echo "perf: budgets passed = $PASSED"
if [ "$PASSED" != "True" ] && [ -z "${PERF_NO_FAIL:-}" ]; then exit 1; fi
