#!/bin/sh
# Android emulator -> this Mac: makes `localhost` inside the emulator reach the
# local services (MinIO photo uploads are signed with http://localhost:9000;
# 3000 = API, 4010 = fake Bunny for reels). Run after every emulator start:
#   sh scripts/dev/emulator-ports.sh
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"
for p in 3000 9000 4010; do "$ADB" reverse "tcp:$p" "tcp:$p"; done
"$ADB" reverse --list
