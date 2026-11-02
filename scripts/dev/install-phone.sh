#!/usr/bin/env bash
# One fresh LawBid on the phone, never two (owner 2026-11-01).
# Only the prod flavor (com.lawbid.lawbid) is installed; the dev / staging
# copies (com.lawbid.lawbid.dev / .staging) are removed first.
#
#   scripts/dev/install-phone.sh android <adb-serial> [path/to/app-prod-release.apk]
#   scripts/dev/install-phone.sh ios <device-udid-or-name> [path/to/Runner.app]
#
# Android: no `pm clear`; prod over prod is an update (`install -r`), data stays.
# Without an APK path the script builds the prod APK first.
set -uo pipefail

PROD=com.lawbid.lawbid
OLD=("$PROD.dev" "$PROD.staging")
platform="${1:-}"; device="${2:-}"; artifact="${3:-}"
[ -n "$platform" ] && [ -n "$device" ] || { sed -n 2,12p "$0"; exit 2; }
cd "$(dirname "$0")/../../apps/mobile" || exit 1

case "$platform" in
  android)
    for id in "${OLD[@]}"; do
      adb -s "$device" uninstall "$id" >/dev/null 2>&1 && echo "removed $id" || echo "$id not installed"
    done
    if [ -z "$artifact" ]; then
      flutter build apk --release --flavor prod -t lib/main_prod.dart \
        --dart-define-from-file=config/prod.json || exit 1
      artifact=build/app/outputs/flutter-apk/app-prod-release.apk
    fi
    adb -s "$device" install -r "$artifact" || exit 1
    echo "installed $PROD"
    adb -s "$device" shell pm list packages | grep -c "package:com.lawbid.lawbid" | sed 's/^/LawBid packages on the phone: /'
    ;;
  ios)
    for id in "${OLD[@]}"; do
      xcrun devicectl device uninstall app --device "$device" "$id" >/dev/null 2>&1 \
        && echo "removed $id" || echo "$id not installed"
    done
    if [ -z "$artifact" ]; then
      flutter build ios --release --flavor prod -t lib/main_prod.dart \
        --dart-define-from-file=config/prod.json || exit 1
      artifact=build/ios/iphoneos/Runner.app
    fi
    xcrun devicectl device install app --device "$device" "$artifact" || exit 1
    echo "installed $PROD"
    ;;
  *) sed -n 2,12p "$0"; exit 2 ;;
esac
