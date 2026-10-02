# LawBid Mobile (Flutter)

Feature-first clean architecture: `core/` (design system, navigation,
persistence) / `features/<name>/presentation/` / `shared/`.
Stack: Riverpod (+ riverpod_generator), go_router (`StatefulShellRoute.indexedStack`),
freezed/json_serializable (wired, not yet used — no models exist before stage
1.7), very_good_analysis (strict lint: strict-casts/inference/raw-types).

Stage: 1.5 (дизайн-система Flutter + каркас) — implemented, **not yet built
or tested on-device**: this repo is edited from a cloud sandbox with no
Flutter SDK available. Before running anything, see
**"Bootstrapping on your Mac"** in `docs/CHANGELOG.md`'s stage 1.5 entry —
you need to run `flutter create` once to generate the `android/`/`ios/`
platform folders (not hand-authored, see that entry for why), then
`flutter pub get`, `dart run build_runner build`, `flutter analyze`,
`flutter test`.

See `docs/01_FOUNDATION_AUTH.md` §15 and `docs/07_DESIGN_SYSTEM.md` (the
latter is authoritative for all colors/fonts/components/screens — file 01
§8 is superseded by it).

## Flavors: three apps side by side

| Flavor | App name | Android applicationId / iOS bundle id | Entry point | Config |
|---|---|---|---|---|
| dev | LawBid | `com.lawbid.lawbid.dev` | `lib/main_dev.dart` (also `lib/main.dart`) | `config/dev.json` |
| staging | LawBid Staging | `com.lawbid.lawbid.staging` | `lib/main_staging.dart` | `config/staging.json` |
| prod | LawBid | `com.lawbid.lawbid` (published to App Store / Google Play) | `lib/main_prod.dart` | `config/prod.json` |

```sh
cp config/dev.example.json config/dev.json            # once per flavor you use
flutter run --flavor dev     -t lib/main_dev.dart     --dart-define-from-file=config/dev.json
flutter run --flavor staging -t lib/main_staging.dart --dart-define-from-file=config/staging.json
flutter run --flavor prod    -t lib/main_prod.dart    --dart-define-from-file=config/prod.json
flutter build appbundle --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json
flutter build ipa       --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json
```

A plain `flutter run` builds **dev**, because `pubspec.yaml` sets `default-flavor: dev`.

- `API_BASE_URL` defaults to the flavor's own value (`lib/core/config/app_environment.dart`). The dev default is the Android emulator's `10.0.2.2`. The staging and prod defaults (`https://staging-api.lawbid.app/api/v1`, `https://api.lawbid.app/api/v1`) are placeholders until the owner confirms the real hosts. The value in `config/<flavor>.json` always wins.
- Android: `productFlavors` (dimension `env`) in `android/app/build.gradle.kts`. The app name comes from the `app_name` resValue, used as `@string/app_name` in the manifest.
- iOS: build configurations `Debug-/Profile-/Release-<flavor>` and schemes `dev`/`staging`/`prod`. `PRODUCT_BUNDLE_IDENTIFIER` and `APP_DISPLAY_NAME` are set per configuration on the Runner target. `ios/Flutter/<config>.xcconfig` includes CocoaPods and `Common.xcconfig`.
- Verify all three: `node tool/verify_flavors.mjs android` and `node tool/verify_flavors.mjs ios`. Each builds every flavor and checks the package or bundle id and the app label.
- Deep links (`lawbid://…`, `https://lawbid.app/…`) are covered in `docs/deeplinks/README.md`.
