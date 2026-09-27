# Deep links: what the owner has to host

The app handles these links (docs/01_FOUNDATION_AUTH.md §12, §10.2 E/F):

| Link | Opens |
|---|---|
| `https://lawbid.app/auth/email-code?email=<address>&code=<6 digits>` | Email code screen with the code filled in, then verifies it (magic sign-in link) |
| `https://lawbid.app/case/<id>` | Case (placeholder until file 04) |
| `https://lawbid.app/lawyer/<username>` | Attorney profile (placeholder until file 03) |
| `https://lawbid.app/post/<id>` | Post (placeholder until file 05) |
| `lawbid://auth/email-code?…`, `lawbid://case/<id>`, … | Same routes over the custom scheme. Works without any hosting |

The `https://` links open the app only after the domain proves it trusts the app. You need to host two files for that.

## 1. iOS: `apple-app-site-association`

1. In `apple-app-site-association`, replace every `TEAM_ID` with your Apple Team ID. That's the 10-character value under developer.apple.com → Membership details.
2. Serve the file at `https://lawbid.app/.well-known/apple-app-site-association`:
   - the file has no extension;
   - use `Content-Type: application/json`;
   - serve it over HTTPS with no redirects.
3. Keep the Associated Domains capability turned on for all three app ids in the Apple Developer portal. Xcode automatic signing does this for you.

The app declares `applinks:$(DEEP_LINK_HOST)` in `apps/mobile/ios/Runner/Runner.entitlements`. `DEEP_LINK_HOST` defaults to `lawbid.app` in `apps/mobile/ios/Flutter/Common.xcconfig`, and `Secrets.xcconfig` can override it.

## 2. Android: `assetlinks.json`

1. In `assetlinks.json`, replace each `SHA256_*` placeholder with the SHA-256 fingerprint of the certificate that signs that variant:
   - **prod** (`com.lawbid.lawbid`): Play Console → Test and release → App integrity → App signing key certificate → SHA-256.
   - **staging / dev**: the fingerprint of the keystore you sign them with. For local debug builds, run `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`.
   - You can list several fingerprints per app, for example the upload key and the app-signing key.
2. Serve the file at `https://lawbid.app/.well-known/assetlinks.json` with `Content-Type: application/json`.

The intent filter in `apps/mobile/android/app/src/main/AndroidManifest.xml` uses `${deepLinkHost}`. It defaults to `lawbid.app`, and you can override it with the Gradle property `-Plawbid.deepLinkHost=…`.

## Using a different domain

Set all three of these to the same host, then host both files there:
- iOS: `DEEP_LINK_HOST` in `Secrets.xcconfig`
- Android: `lawbid.deepLinkHost` in `android/gradle.properties`, or `-P` on the command line
- Dart: `"DEEP_LINK_HOST"` in `config/<flavor>.json`

## Server side

The sign-in email must contain the magic link exactly as `https://lawbid.app/auth/email-code?email=<url-encoded email>&code=<code>`. The `lawbid://` form also works, but mail clients often don't make it clickable.

## Testing on a device or simulator

```sh
# Android (the app must be installed; use the package of the flavor you run)
adb shell am start -a android.intent.action.VIEW -d "lawbid://auth/email-code?email=ann%40example.com&code=123456"
adb shell pm verify-app-links --re-verify com.lawbid.lawbid   # after hosting assetlinks.json
adb shell pm get-app-links com.lawbid.lawbid

# iOS simulator
xcrun simctl openurl booted "lawbid://auth/email-code?email=ann%40example.com&code=123456"
xcrun simctl openurl booted "https://lawbid.app/case/3f0c9a8e-1b2d-4c5e-9f00-112233445566"
```
