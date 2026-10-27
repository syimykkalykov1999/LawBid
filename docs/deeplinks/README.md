# Deep links: what the owner has to host

The app handles these links (docs/01_FOUNDATION_AUTH.md §12, §10.2 E/F):

| Link | Opens |
|---|---|
| `https://lawbid.dev/auth/email-code?email=<address>&code=<6 digits>` | Email code screen with the code filled in, then verifies it (magic sign-in link) |
| `https://lawbid.dev/case/<id>` | Case (placeholder until file 04) |
| `https://lawbid.dev/lawyer/<username>` | Attorney profile (placeholder until file 03) |
| `https://lawbid.dev/attorneys/<username>/` | The same attorney profile, from the public SEO page (a Google result on a phone with the app installed; without the app the website opens as before) |
| `https://lawbid.dev/post/<id>` | Post (placeholder until file 05) |
| `lawbid://auth/email-code?…`, `lawbid://case/<id>`, … | Same routes over the custom scheme. Works without any hosting |

The `https://` links open the app only after the domain proves it trusts the app. Both files are generated and published by `seo-deploy.yml` (`scripts/seo/well-known.mjs`, tested in `scripts/seo/test/well-known.test.mjs`); nothing is uploaded by hand. They open in the app: `/u/*` (profile QR), `/q/*` (website sign-in QR), `/g/*` (group invitation), `/lawyer/*`, `/attorneys/*`, `/case/*`, `/post/*`, `/r/*` and `/auth/email-code`.

The `/lawyers/` tree (hub, state, practice pages of the SEO site) is **not** opened by the app on purpose: those are catalog pages the app has no screen for, and `/lawyers/<state>/` cannot be told apart from a username by a path pattern. Tests (`well-known.test.mjs`, `deep_link_platform_config_test.dart`) fail if it is added.

## 1. iOS: `apple-app-site-association`

Served at `https://lawbid.dev/.well-known/apple-app-site-association`, no extension, `Content-Type: application/json`, no redirect. Team ID 78T56RPM74, bundle `com.lawbid.lawbid`. `docs/deeplinks/apple-app-site-association` is a copy kept equal to the generated file by a test.

Keep the Associated Domains capability on for the app id in the Apple Developer portal (Xcode automatic signing does this). The app declares `applinks:$(DEEP_LINK_HOST)` in `apps/mobile/ios/Runner/Runner.entitlements`. `DEEP_LINK_HOST` defaults to `lawbid.dev` in `apps/mobile/ios/Flutter/Common.xcconfig`.

## 2. Android: `assetlinks.json`

Served at `https://lawbid.dev/.well-known/assetlinks.json`, `Content-Type: application/json`, package `com.lawbid.lawbid`. It needs the SHA-256 of the certificate Google Play signs the app with:

1. Play Console → Test and release → App integrity → App signing key certificate → SHA-256.
2. GitHub → the LawBid repository → Settings → Secrets and variables → Actions → Variables → new variable `ANDROID_APP_SHA256` with that value. Several fingerprints (for example the upload key too) go in one value separated by commas.
3. Run the workflow "SEO pages" by hand (or wait for the daily run).

Until the variable exists the Android file is not published (a made-up fingerprint would only look valid) and Android keeps opening the links in the browser; the workflow prints a warning. Check after publishing: `adb shell pm verify-app-links --re-verify com.lawbid.lawbid`, then `adb shell pm get-app-links com.lawbid.lawbid`.

The intent filter in `apps/mobile/android/app/src/main/AndroidManifest.xml` uses `${deepLinkHost}`. It defaults to `lawbid.dev`, and you can override it with the Gradle property `-Plawbid.deepLinkHost=…`.

## 3. Passkeys (owner 2026-10-22)

The same two files also tell the phones that the app may create and use
passkeys for `lawbid.dev`:

- iOS: `webcredentials` → `78T56RPM74.com.lawbid.lawbid` in the AASA file,
  and the app declares `webcredentials:$(DEEP_LINK_HOST)` in
  `Runner.entitlements` (the Associated Domains capability must stay on in
  the Apple Developer portal).
- Android: the relation `delegate_permission/common.get_login_creds` beside
  `handle_all_urls` in `assetlinks.json` — with the SHA-256 of the Play
  signing key **and** of the upload key (comma-separated in
  `ANDROID_APP_SHA256`), otherwise a debug / internal-testing build cannot
  create passkeys.
- Web: the passkeys bridge script in `apps/mobile/web/index.html` is loaded
  from GitHub releases; the web CSP (`infra/modules/web`) must allow that
  origin in `script-src`, else the browser reports no passkey support and
  the app hides the button.

## Using a different domain

Set all three of these to the same host, then host both files there:
- iOS: `DEEP_LINK_HOST` in `Secrets.xcconfig`
- Android: `lawbid.deepLinkHost` in `android/gradle.properties`, or `-P` on the command line
- Dart: `"DEEP_LINK_HOST"` in `config/<flavor>.json`

## Server side

The sign-in email must contain the magic link exactly as `https://lawbid.dev/auth/email-code?email=<url-encoded email>&code=<code>`. The `lawbid://` form also works, but mail clients often don't make it clickable.

## Testing on a device or simulator

```sh
# Android (the app must be installed; use the package of the flavor you run)
adb shell am start -a android.intent.action.VIEW -d "lawbid://auth/email-code?email=ann%40example.com&code=123456"
adb shell pm verify-app-links --re-verify com.lawbid.lawbid   # after hosting assetlinks.json
adb shell pm get-app-links com.lawbid.lawbid

# iOS simulator
xcrun simctl openurl booted "lawbid://auth/email-code?email=ann%40example.com&code=123456"
xcrun simctl openurl booted "https://lawbid.dev/case/3f0c9a8e-1b2d-4c5e-9f00-112233445566"
```

## Spotlight (iPhone) and the Android side of app indexing

Owner 2026-10-27 (docs/architecture/PSEO_ASO_PACKAGE_PLAN_2026-10-27.md §3). No new screen or button anywhere.

- **iOS Spotlight** (`apps/mobile/lib/core/platform/spotlight_index.dart`, native `SpotlightBridge` in `ios/Runner/AppDelegate.swift`): CoreSpotlight, on-device index only (never Apple's public index). Indexed: the attorney profiles the user opened and the attorney posts the user saved. Title and subtitle only (name, practices, licensed states / first line of the post, author), expiry 60 days, at most 60 items. Never a client, a client post, the user's own profile or a blocked profile. The item's identifier is its https link; a tap on a result goes through `SpotlightDeepLinkSource` into the same `DeepLinkController` as a Universal Link. Opt-out: Settings → Privacy → «Do not sell or share» (existing switch, `doNotSell`) empties the index and stops indexing; sign-out / account switch empties it too; flag `spotlight_indexing` (default on) is the kill switch.
- **Siri Shortcuts**: nothing donated. Every existing action needs a screen or an App Intents extension (plan §3 item 3 puts that after the release), so it is not done in this package.
- **Android**: App Links only (the `/attorneys/` path prefix above plus `assetlinks.json`); Firebase App Indexing is deprecated, no SDK added.
- **Check**: iOS, Notes: write `https://lawbid.dev/attorneys/<username>/`, long-press → Open in LawBid; open a profile in the app, then search its name in Spotlight (iOS Settings → Siri & Search → LawBid → Show App in Search / Show Content in Search must be on). Android: `adb shell pm verify-app-links --re-verify com.lawbid.lawbid`, then `adb shell am start -a android.intent.action.VIEW -d "https://lawbid.dev/attorneys/<username>/" com.lawbid.lawbid`.
