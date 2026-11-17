import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Licence audit 2026-11-17 (owner row 232): the notices Flutter cannot
/// collect by itself. Flutter already lists the LICENSE of every Dart
/// package; this adds the fonts in `assets/fonts/` and every section of
/// `THIRD_PARTY_NOTICES.md` (code copied into the app, the vendored web
/// files, the native iOS/Android SDKs). They show on Flutter's standard
/// licence page (`showLicensePage`) and ship inside the app bundle.
///
/// The pattern is copied from the google_fonts README, «Licensing Fonts»
/// (https://pub.dev/packages/google_fonts, Apache-2.0). The callback runs
/// only when a licence list is read, so app start does no extra work.
void registerBundledLicenses() {
  LicenseRegistry.addLicense(bundledLicenses);
}

/// The font licence files shipped as assets, with the name shown for each.
const bundledLicenseAssets = <String, String>{
  'Inter (font)': 'assets/fonts/OFL-Inter.txt',
  'Source Serif 4 (font)': 'assets/fonts/OFL-SourceSerif4.txt',
  'Phosphor Icons (font)': 'assets/fonts/LICENSE-Phosphor.txt',
};

/// The app's notices file, one licence entry per `## ` section.
const bundledNoticesAsset = 'THIRD_PARTY_NOTICES.md';

/// Every extra licence entry; see [registerBundledLicenses].
Stream<LicenseEntry> bundledLicenses() async* {
  for (final font in bundledLicenseAssets.entries) {
    final text = await rootBundle.loadString(font.value);
    yield LicenseEntryWithLineBreaks([font.key], text);
  }
  final notices = await rootBundle.loadString(bundledNoticesAsset);
  for (final section in notices.split('\n## ').skip(1)) {
    final end = section.indexOf('\n');
    if (end <= 0) continue;
    yield LicenseEntryWithLineBreaks(
      [section.substring(0, end).trim()],
      section.substring(end + 1).trim(),
    );
  }
}
