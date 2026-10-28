---
name: device-build-entrypoint
description: Device builds must pass -t lib/main_prod.dart with --flavor prod; plain flutter build uses main.dart = dev flavor (API 10.0.2.2) and the app shows "Нет подключения"
metadata:
  type: feedback
---

2026-10-28: I built iOS and Android with `flutter build ... --flavor prod` but without `-t lib/main_prod.dart`. `lib/main.dart` imports `main_dev.dart`, so the app pointed at the dev API (10.0.2.2) and both phones showed «Нет подключения»; the owner lost time thinking the server broke.

**Why:** the native flavor and the Dart entry point are separate; only the entry point picks the API URL (apps/mobile/lib/core/config/app_environment.dart).

**How to apply:** always `flutter build ios|apk --release --flavor prod -t lib/main_prod.dart`. After installing, check the API logs (Logs Insights on /lawbid/lawbid-prod/api) show requests from the phone before telling the owner it is ready. Related: [[local-dev-environment]].
