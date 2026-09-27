## p12 leaf-1.4: mobile platform (flavors, app version, updates, SMS autofill, deep links)

Spec: docs/01 §5.1, §7, §10.2 D/E/F, §12, §15 "Этап 1.8".

### Three installable variants (owner requirement)
- **dev**: "LawBid Dev", `com.lawbid.lawbid.dev`
- **staging**: "LawBid Staging", `com.lawbid.lawbid.staging`
- **prod**: "LawBid", `com.lawbid.lawbid` (the build for the App Store and Google Play)

Details:
- **Android.** `productFlavors` (dimension `env`) with `applicationIdSuffix` and `resValue app_name`. The manifest uses `android:label="@string/app_name"`. AGP 9 needs `buildFeatures.resValues = true`.
- **iOS.**
  - Build configurations `Debug/Profile/Release-{dev,staging,prod}` and schemes `dev`, `staging`, `prod` (Flutter flavor convention).
  - `PRODUCT_BUNDLE_IDENTIFIER` and `APP_DISPLAY_NAME` are set per configuration on the Runner target. `Info.plist` reads `CFBundleDisplayName = $(APP_DISPLAY_NAME)`.
  - `ios/Flutter/<config>.xcconfig` includes the Pods xcconfig and `Common.xcconfig`, which holds the Google URL-scheme default, `DEEP_LINK_HOST` and `Secrets.xcconfig`. The old flavorless `Debug/Release.xcconfig`, the Debug/Release/Profile configurations and the `Runner` scheme are removed.
  - The Podfile maps all 9 configurations. `pod install` is verified.
- **Entry points.** `lib/main_{dev,staging,prod}.dart` call `runLawBid(AppFlavor.x)` (`lib/core/config/run_app.dart`). `lib/main.dart` is dev, and `pubspec.yaml` sets `default-flavor: dev`, so a plain `flutter run` still works.
- **API base URL.** `AppEnvironment` (`lib/core/config/app_environment.dart`) picks a per-flavor default, and the `API_BASE_URL` dart-define overrides it.
  - **Owner to confirm:** the staging and prod defaults are placeholders: `https://staging-api.lawbid.app/api/v1` and `https://api.lawbid.app/api/v1`.
  - `config/{dev,staging,prod}.example.json` exist.
- **Run.** `flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=config/dev.json`. See apps/mobile/README.md → Flavors.
- **Verification.** `node tool/verify_flavors.mjs android|ios` builds each flavor and checks the id and label with aapt or plutil.
- **Entitlements.** `Runner.entitlements` is now wired via `CODE_SIGN_ENTITLEMENTS` for every configuration. It was pending since the Sign in with Apple pass. It now also carries Associated Domains.
  - Associated Domains and Sign in with Apple need a paid Apple Developer team to sign for a device. Simulator builds and no-codesign builds are unaffected.

### App version, soft update and forced update
- **X-App-Version.** The header now sends the real installed version (`package_info_plus`, loaded before `runApp`). It was hardcoded to `'0.1.0'` before. `AppVersion.fallback` stays `0.1.0` so that a failed lookup can never trigger 426 on every request.
- **Forced update on 426.** `AppUpdateInterceptor`, registered in `dioProvider` right after the headers interceptor, handles any `426` or `APP_UPDATE_REQUIRED` response by opening the non-dismissible forced-update screen over whatever route is showing. This closes the stage 1.8 gap noted in CHANGELOG. The bootstrap `min_app_version_*` self-check still applies.
- **Soft update.**
  - `soft_update_version_{platform}` from `/config/bootstrap` shows a dismissible prompt. "Later" is remembered per soft version, and a newer soft version prompts again.
  - The prompt is shown only after the splash and only to a signed-in user, so the pre-app flow does not change.
- **Update button.** It opens `app_config.store_url_{platform}` when set, which lets the admin configure it. Otherwise it opens the Play listing of the running applicationId on Android, or `apps.apple.com/app/id$APP_STORE_ID` (a dart-define) on iOS. If no URL is available it shows a snackbar. The old `_UpdateRequiredGate` in app.dart moved to `lib/core/app_update/app_update_gate.dart`.

### Android
- **minSdk 26.** `minSdk = 26` (docs/01 §5.1).
- **SMS Retriever OTP autofill** (docs/01 §10.2 D) via `smart_auth`.
  - Listening starts before the code is requested, and again on resend. The code appears in the cells and is verified automatically.
  - Late SMS for a previous number are ignored.
  - iOS keeps the `oneTimeCode` keyboard autofill.

### OTP screen
- **«Изменить номер» / "Change number"** ("Change email" for the email code) sits under the resend timer. It uses the same caption link style and a 44pt hit area, and returns to the phone or email entry with the value kept.
- **Golden updates.** Only `auth_otp_screen_light.png` and `auth_otp_screen_dark.png` were regenerated. The diff is exactly the new link.
- **Unchanged.** The welcome screen and its goldens are byte-identical.

### Deep links (docs/01 §12, §10.2 E/F)
- **Magic link.** `lawbid://auth/email-code?email&code` and `https://lawbid.app/auth/email-code?email&code` open the email code screen with the code prefilled and verify it. The link is ignored if the user is already signed in.
- **Content links.** `https://lawbid.app/case/:id`, `/lawyer/:username` and `/post/:id` (also over `lawbid://`) open "coming soon" placeholder routes. TODO(docs/03, docs/04, docs/05): real screens. The link waits until the user is signed in and onboarded.
- **Cold start.** A link that launches the app is held until the splash finishes.
- **Handling.** `app_links` feeds `DeepLinkController` (`lib/core/deeplinks`). Flutter's built-in deep linking is disabled (`flutter_deeplinking_enabled` / `FlutterDeepLinkingEnabled` = false) so the magic link can run verification. The parser only accepts strict shapes: a 6-digit code, and usernames per §12.
- **Native config.**
  - Android: custom-scheme and `autoVerify` App Links intent filters on `${deepLinkHost}` (Gradle property `lawbid.deepLinkHost`, default `lawbid.app`).
  - iOS: the `lawbid` URL scheme, plus `applinks:$(DEEP_LINK_HOST)`.
- **Owner hosts two files:**
  - `docs/deeplinks/apple-app-site-association`, with `TEAM_ID` placeholders.
  - `docs/deeplinks/assetlinks.json`, with SHA-256 placeholders.
  - Instructions are in `docs/deeplinks/README.md`.

### Note for leaf-1.2 / server (not edited here)
- **SMS text.** To make Android SMS Retriever autofill work, the OTP SMS must end with the app's 11-character hash, for example `<#> Your LawBid code: 123456` followed by the hash on a new line. The hash depends on the applicationId and signing key, so it differs per flavor and between debug and release. `SmsCodeRetriever.appSignature()` returns it on the device, or compute it with the usual keytool method. Suggested server change: an env or app_config value such as `sms.android_app_hash` appended to the Twilio or Verify message. With Twilio Verify, use its Android app-hash parameter.
- **Magic link format.** The sign-in email's magic link must be `https://lawbid.app/auth/email-code?email=<urlencoded>&code=<code>`.

### New translation keys
`auth.otp.changeNumber`, `auth.otp.changeEmail`, `app.update.storeUnavailable`, `app.softUpdate.{title,message,update,later}`, `deeplink.{case,lawyer,post}.title`, `deeplink.comingSoon.{heading,body}`. They are in apps/api/prisma/seed/pending_keys/leaf-1.4.csv.

### Shared files touched outside this leaf's OWNS (minimal)
- `pubspec.yaml`: additive. Adds `package_info_plus`, `app_links`, `url_launcher`, `smart_auth` and `default-flavor`.
- `lib/app.dart`: uses the gate from core/app_update and the flavor title.
- `lib/core/network/{dio_client,headers_interceptor}.dart`
- `lib/core/navigation/app_router.dart`: deep-link routes.
- `lib/core/design_system/widgets/inputs/app_otp_field.dart`: optional `controller`.
- `lib/core/l10n/static_translator.dart`
- `docs/KEYS_SETUP.md` and `apps/mobile/README.md`: run commands.
