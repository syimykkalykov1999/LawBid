# Store release checklist (App Store + Google Play)

Owner 2026-10-06: publish as soon as the AWS prod API is up, without waiting
for SES production access. Owner-facing steps in Russian, field by field:
`/mnt/project-files/store/shagi-vladelca.md` (project files). Store texts:
`/mnt/project-files/store/listing-en.md`.

## 1. Done in the code

| Item | Where |
|---|---|
| Prod API `https://api.lawbid.dev/api/v1`, links on `lawbid.dev` | `lib/core/config/app_environment.dart`, `config/*.example.json`, Gradle `lawbid.deepLinkHost`, iOS `DEEP_LINK_HOST` |
| Version `1.0.0+1`; the build number is automatic (minutes since 2026-01-01 UTC, always higher than the last upload; nobody bumps it) | `pubspec.yaml`, `build.gradle.kts` `autoBuildNumber`, iOS phase "Auto build number" |
| No plain-http exception in the prod iOS bundle | Runner build phase "Strip dev-only ATS (prod)" |
| `ITSAppUsesNonExemptEncryption = NO` (no export question per upload) | `ios/Runner/Info.plist` |
| iPhone only (`TARGETED_DEVICE_FAMILY = 1`): no iPad screenshots or iPad layout review; iPad can be added later, never removed | `project.pbxproj` |
| Privacy manifest | `ios/Runner/PrivacyInfo.xcprivacy` |
| Push entitlement `aps-environment` + time-sensitive calls | `ios/Runner/Runner.entitlements` |
| Permission texts mention videos, reels, video calls (en/ru) | `Info.plist`, `*.lproj/InfoPlist.strings` |
| `INTERNET` permission in the release manifest | `android/app/src/main/AndroidManifest.xml` |
| R8 rules for Stripe, WebRTC, CallKit | `android/app/proguard-rules.pro` |
| Stripe pages (checkout, portal) open in Safari on iOS | `lib/shared/domain/payment_page_launch_mode.dart` |
| AASA with Team ID 78T56RPM74, `/delete-account` page | LawBidSite PR #17 |
| Sign-in is by phone number only: Apple/Google sign-in code, plugins, entitlement and URL scheme removed (owner 2026-10-16); e-mail flows stay off behind the admin flag `email_login` | `lib/features/auth`, `Runner.entitlements`, `Info.plist` |
| Guard tests | `test/release/store_release_config_test.dart` |

## 2. The one final build (Mac; owner rule: build once, at the end)

Run only after `https://api.lawbid.dev/api/v1/health` answers.

1. `git pull`, `flutter pub get`, `dart run build_runner build --delete-conflicting-outputs`.
2. `config/prod.json` (gitignored): copy `config/prod.example.json`, then fill
   `STRIPE_PUBLISHABLE_KEY=pk_live_…` (same Stripe account as the server's
   live key). `APP_STORE_ID` stays empty until App Store Connect shows
   the app's Apple ID. Check that an older local `prod.json` does not still
   say `lawbid.app`.
3. Firebase prod files (project `lawbid-6e5ff`, gitignored):
   `android/app/src/prod/google-services.json` and the iOS
   `GoogleService-Info.plist` for bundle `com.lawbid.lawbid`.
4. `ios/Flutter/Secrets.xcconfig`: `DEVELOPMENT_TEAM = 78T56RPM74`.
5. Android upload key (once): `keytool -genkey -v -keystore ~/lawbid-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`;
   export `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS=upload`, `ANDROID_KEY_PASSWORD`. Keep the .jks and the
   passwords in a password manager; Play App Signing holds the real key.
6. Android: `flutter build appbundle --release --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json`
7. iOS: set `teamID` in `ios/ExportOptions.plist` to `78T56RPM74` locally, then
   `flutter build ipa --release --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json --export-options-plist=ios/ExportOptions.plist`
   and upload with Transporter or Xcode Organizer.
8. Checks:
   - `plutil -p build/ios/archive/Runner.xcarchive/Products/Applications/Runner.app/Info.plist | grep -c NSAppTransportSecurity` → `0`.
   - Play Console "App bundle explorer": target SDK ≥ 35, no 16 KB page-size
     warning (watch flutter_webrtc, video_compress).
   - Install from Play Internal testing / TestFlight: sign in, open a case,
     push arrives, a video plays, a payment link opens.

## 3. Reviewer access

Sign-in is by phone/e-mail code, which reviewers cannot receive. Use the
existing **demo world** (Apple guideline 2.1 accepts a fully featured demo
mode): admin → Деньги → Партнёры → «Демо-доступ» → create one **client** and
one **attorney** demo account; each gives an 8-character code (30 days,
reusable). Reviewers tap «I have a demo code» on the welcome screen. Demo
blocks payments, SMS, e-mail and push; its data never mixes with real users.
Prerequisite on AWS: database `lawbid_demo` exists and the API role may use it
(docs/ops/demo-world.md); «Демо-доступ» must not say «Демо-база не готова».

Review notes (paste as is, codes filled in):

> LawBid connects people who need legal help with licensed US attorneys.
> Sign-in is by SMS/e-mail code, so please use the demo mode: on the first
> screen tap "I have a demo code" and enter CLIENT_CODE (client side) or
> ATTORNEY_CODE (attorney side). Demo mode is a complete copy of the app with
> sample data; payments are disabled there. Attorney subscriptions are bought on our website
> (Stripe) through a link that opens in Safari, as allowed for the US
> storefront; the app is available in the United States only. Account
> deletion: Settings → Account → Delete account.

## 4. App Privacy (App Store Connect), matching PrivacyInfo.xcprivacy

"Do you or your third-party partners collect data?" → **Yes**. For every type:
**Linked to the user: Yes**, **Used for tracking: No**, purpose **App Functionality** only.

- Contact Info: Name, Email Address, Phone Number, **Contacts** (optional "Find people from your contacts": phone numbers are hashed on the device, only hashes are uploaded)
- User Content: Photos or Videos, Audio Data, Emails or Text Messages (chat), Customer Support, Other User Content (cases, posts, reviews)
- Identifiers: User ID, Device ID
- Purchases: Purchase History
- Usage Data: Product Interaction
- Other Data: Other Data Types (attorney license / ID images, verification selfie)

Not collected: location, health, financial info, browsing/search
history, advertising data, diagnostics (the app has no analytics or crash SDK).

## 5. Google Play Data safety

- Collects data: **Yes**. Shares with third parties: **No** (Stripe, AWS, Twilio, Firebase, Bunny, Google Translate are service providers).
- Encrypted in transit: **Yes**. Deletion: **Yes**, URL `https://lawbid.dev/delete-account`.
- Types, all **Collected**, purposes **App functionality** and **Account management** (Device IDs also **Fraud prevention, security**):
  - Personal info: Name, Email address, Phone number, User IDs, Other info (license number, ID document) — required
  - Financial info: Purchase history — optional
  - Messages: Other in-app messages — optional
  - Photos and videos: Photos, Videos — optional
  - Audio: Voice or sound recordings — optional
  - Files and docs — optional
  - App activity: App interactions, Other user-generated content — optional
  - Contacts — optional (hashed phone numbers, App functionality)
  - Device or other IDs — required
- Not collected: location, calendar, health, web browsing, crash logs, diagnostics.

## 6. Age rating

- Apple: user-generated content **Yes**, messaging/chat **Yes**, mature or suggestive themes **Infrequent/Mild** (legal topics: crime, divorce), everything else **None**, gambling **No**, unrestricted web access **No**. Terms require 18+, so pick **18+** where offered.
- Google IARC: category "Social or communication"; users interact **Yes**, user-generated content **Yes**, shares location **No**, digital purchases **Yes**, violence/sex/drugs/gambling **No**.

## 7. Other store forms

- Category Lifestyle (Business secondary on Apple). Countries: **United States only**.
- Content rights: Yes, we hold the rights. Ads: **No**. Target audience (Play): **18+**, not for children.
- News / government / financial / health app: **No**.
- Play permission declarations, if asked after upload: Full-screen intent → **Calling** (incoming in-app calls); foreground service → phone call; camera and microphone → profile photo, verification, reels, voice messages, calls.
- Payments risk: subscriptions are digital services sold through Stripe outside the stores. US-storefront rules (Apple 3.1.1(a) US; Google US policy after Epic v. Google) allow linking out to web purchase; keep the app US-only. If a reviewer still objects, the fallback is hiding purchase buttons on iOS and selling on lawbid.dev only.

## 8. Screenshots

From the demo world on the Mac (simulator/emulator), English UI, light theme.

- Apple: iPhone 6.9" (1320×2868), 3 to 10. No iPad (app is iPhone-only).
- Google: phone, 1080×1920 or larger, 2 to 8; plus `play-icon-512.png` and `play-feature-graphic-1024x500.png` (project files, `store/`).
- Order: 1) client home "Post your case free" 2) attorney sends an offer 3) compare offers 4) chat with an attorney 5) verified attorney profile 6) attorney: new case alerts 7) feed with posts and reels 8) block/report and privacy.

## 9. Store listings in every language (automatic)

`apps/mobile/ios/fastlane/metadata/<locale>/` (39 App Store localizations)
and `apps/mobile/android/fastlane/metadata/android/<locale>/` (87 Google
Play languages) hold the name/title, subtitle, keywords, promo text, short
and full description. The texts are adapted per language, not translated word for word, with the same
store and liability limits as English; `test/release/store_release_config_test.dart`
checks every length limit. Language is not country availability: the app
is listed only in the countries switched on in admin → Страны (now: US).

Upload after the app exists in both stores (and, for Google Play, after the
first AAB is uploaded):

- iOS (Mac): `cd apps/mobile/ios && FASTLANE_USER=<owner Apple ID> bundle exec fastlane ios metadata`
  (or with `ASC_KEY_ID`/`ASC_ISSUER_ID`/`ASC_KEY_CONTENT`). Owner types the 2FA code once.
- Android: `cd apps/mobile/android && PLAY_JSON_KEY_FILE=<service-account.json> bundle exec fastlane android metadata`.

Manual fallback: paste only English (U.S.), Spanish and Russian from
`/mnt/project-files/store/listing-en.md`.
