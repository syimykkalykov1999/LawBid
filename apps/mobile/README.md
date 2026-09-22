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
