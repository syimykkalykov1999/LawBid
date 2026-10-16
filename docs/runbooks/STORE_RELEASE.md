# Store release runbook (Google Play + App Store)

Step by step for the owner's Mac. Facts (what is already in the code, App
Privacy / Data safety answers, age rating, reviewer demo codes) are in
[`docs/store/RELEASE_CHECKLIST.md`](../store/RELEASE_CHECKLIST.md); this file
is the order of actions. Rule: build once, at the end, after
`https://api.lawbid.dev/api/v1/health` answers.

## What is already fixed in the repo (checked against the code)

| Item | Value |
|---|---|
| Android `applicationId` | `com.lawbid.lawbid` (prod, no suffix); dev/staging add `.dev`/`.staging` |
| iOS bundle id | `com.lawbid.lawbid`; Team ID `78T56RPM74` |
| Version | `1.0.0+1`; build number is automatic (minutes since 2026-01-01 UTC), never bump by hand |
| Android | minSdk 26, R8 shrink with `proguard-rules.pro`, `INTERNET`, `POST_NOTIFICATIONS`, camera, microphone, contacts, biometrics declared; adaptive + monochrome icons present |
| iOS | permission texts for camera, microphone, photos, contacts, Face ID (en/ru `InfoPlist.strings`), privacy manifest, push and time-sensitive entitlements, iPhone only, ATS exception stripped from prod |
| Signing | release bundle uses the upload key from `android/key.properties` or `ANDROID_KEYSTORE_*` env; a **prod bundle without the key now fails at once** instead of producing a debug-signed file Play rejects |
| Store texts | 39 App Store and 87 Google Play languages in `apps/mobile/{ios,android}/fastlane/metadata`; English and Russian assembled in project files `store/listing-en.md`, `store/listing-ru.md` |
| Links | Privacy `https://lawbid.dev/privacy`, Terms `https://lawbid.dev/terms`, Support `https://lawbid.dev/contact`, deletion `https://lawbid.dev/delete-account` |

Not in the repo (owner supplies): upload keystore, `google-services.json`,
`GoogleService-Info.plist`, `config/prod.json` with `pk_live_…`, screenshots,
Shorebird app id (see the end).

## 0. Once: tools on the Mac

Flutter (stable), Xcode, CocoaPods, JDK 17, Android SDK, Ruby + `bundle install`
in `apps/mobile` (fastlane). Then:

```
git pull
cd apps/mobile
flutter pub get
dart run build_runner build --delete-conflicting-outputs
```

## 1. Config files (git-ignored, never committed)

1. `config/prod.json`: copy `config/prod.example.json`; set
   `STRIPE_PUBLISHABLE_KEY=pk_live_…`. `GOOGLE_*` stay empty (no Google
   sign-in in v1). `APP_STORE_ID` stays empty until step 5 gives the Apple ID.
2. Firebase project `lawbid-6e5ff`: Firebase console → Project settings →
   add Android app `com.lawbid.lawbid` and iOS app `com.lawbid.lawbid`;
   download and save as
   `apps/mobile/android/app/src/prod/google-services.json` and
   `apps/mobile/ios/Runner/GoogleService-Info.plist`.
   iOS push also needs an APNs key (Apple Developer → Keys → APNs) uploaded
   in Firebase → Cloud Messaging.
3. `apps/mobile/ios/Flutter/Secrets.xcconfig` from `Secrets.example.xcconfig`:
   `DEVELOPMENT_TEAM = 78T56RPM74`; `GOOGLE_REVERSED_CLIENT_ID` can stay the
   default "not configured" value.

## 2. Android

### 2.1 Upload key (once, keep forever)

```
keytool -genkey -v -keystore ~/lawbid-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Back up the `.jks` and both passwords in a password manager. Create
`apps/mobile/android/key.properties` (git-ignored):

```
storeFile=/Users/<you>/lawbid-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

(CI uses the `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` secrets instead.)

### 2.2 Build

```
cd apps/mobile
flutter build appbundle --release --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json
```

Output: `build/app/outputs/bundle/prodRelease/app-prod-release.aab`.

### 2.3 Play Console

1. Create app "LawBid", default language English (US), free, US only.
2. Enrol in **Play App Signing** when uploading the first bundle (Google keeps
   the real key; the `.jks` above is only the upload key).
3. Testing → Internal testing → create release → upload the `.aab` → add
   yourself as tester → install from the link and run the checks in
   RELEASE_CHECKLIST §2 point 8.
4. Fill the forms from RELEASE_CHECKLIST §5 (Data safety), §6 (rating), §7
   (category, ads, audience, permission declarations), reviewer demo codes §3.
5. Store listing: texts from `store/listing-en.md`; graphics: icon 512×512,
   feature graphic 1024×500, 2–8 phone screenshots (RELEASE_CHECKLIST §8).
6. Production → create release from the tested build → send for review.
   Personal developer accounts created after Nov 2023 need a closed test
   (12 testers, 14 days) before Production; organization accounts do not.

Optional: after the first upload, `PLAY_JSON_KEY_FILE=<service-account.json>
bundle exec fastlane android metadata` (in `apps/mobile/android`) pushes the
texts of all 87 languages.

## 3. iOS

1. Apple Developer → Identifiers: App ID `com.lawbid.lawbid` with
   capabilities Push Notifications, Associated Domains, Sign in with Apple
   (the entitlement file declares it; the profile must include it or the
   archive fails to sign).
2. App Store Connect → New app: name LawBid, bundle id above, SKU `lawbid`,
   primary language English (U.S.). Copy the numeric Apple ID into
   `APP_STORE_ID` in `config/prod.json`.
3. Xcode: open `ios/Runner.xcworkspace`, target Runner → Signing &
   Capabilities → Release-prod: Team `78T56RPM74`, "Automatically manage
   signing" on.
4. Build and export:
   ```
   cd apps/mobile
   # set teamID to 78T56RPM74 in ios/ExportOptions.plist locally; do not commit
   flutter build ipa --release --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json --export-options-plist=ios/ExportOptions.plist
   ```
   Output: `build/ios/ipa/*.ipa`. (Alternative: `flutter build ipa` without
   export options, then Xcode → Window → Organizer → Distribute App → App
   Store Connect.)
5. Upload the `.ipa` with Transporter (App Store → Transporter) or Organizer.
   After processing (10–30 min) it appears under TestFlight.
6. TestFlight: add yourself under Internal Testing, install, run the checks
   from RELEASE_CHECKLIST §2 point 8. Check no ATS exception shipped:
   `plutil -p build/ios/archive/Runner.xcarchive/Products/Applications/Runner.app/Info.plist | grep -c NSAppTransportSecurity` → `0`.
7. App Store Connect → the version: paste texts from `store/listing-en.md`
   (or `cd apps/mobile/ios && FASTLANE_USER=<Apple ID> bundle exec fastlane ios metadata`
   for all 39 languages), upload 6.9" screenshots (3–10), App Privacy from
   RELEASE_CHECKLIST §4, age rating §6, review notes with demo codes §3,
   Privacy URL and Support URL from the table above, choose the TestFlight
   build → Submit for Review.

## 4. What the owner must provide (summary)

1. Android upload keystore + `key.properties` (step 2.1).
2. `google-services.json` and `GoogleService-Info.plist` from Firebase
   `lawbid-6e5ff`, plus an APNs key uploaded to Firebase.
3. `config/prod.json` with the live Stripe publishable key.
4. Screenshots: iPhone 6.9" (1320×2868) and Android phone (1080×1920+),
   in the order of RELEASE_CHECKLIST §8; Play icon and feature graphic.
5. Two demo codes (client, attorney) from the admin for the reviewers.
6. Apple: enable Push, Associated Domains, Sign in with Apple on the App ID.

## 5. Things to decide before submitting

- **Contacts.** Declared as collected (hashed, optional) in the privacy manifest and in RELEASE_CHECKLIST §4–5; answer Play Data safety and App Privacy the same way.
- **Sign in with Apple.** The owner's decision is "no Google/Apple sign-in",
  but `Runner.entitlements` still declares it and the review notes mention
  it. If the feature is off in v1, remove the entitlement and that sentence
  (Apple 4.8 only requires it when another third-party login is offered).
- **Shorebird.** There is no `shorebird.yaml` in the repo. To enable patches:
  `shorebird login`, `shorebird init` in `apps/mobile` (creates the app id,
  commit `shorebird.yaml`), then build with `shorebird release android|ios
  --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json`
  instead of `flutter build`, and ship fixes with `shorebird patch`. Only
  Dart code can be patched; native or permission changes need a store release.
