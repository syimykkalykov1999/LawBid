// Writes assets/l10n/static_strings_<code>.json from the compiled-in
// Russian and English strings (lib/core/l10n/static_strings_compiled.dart),
// the files the web build reads instead of compiling the maps in
// (lib/core/l10n/static_strings.dart).
//
//   cd apps/mobile && dart run tool/gen_static_strings.dart
//
// Run it after changing any lib/core/l10n/strings/*.dart file;
// test/core/l10n/static_strings_asset_test.dart fails until you do.
import 'dart:io';

import 'package:lawbid/core/l10n/static_strings_assets.dart';
import 'package:lawbid/core/l10n/static_strings_compiled.dart';

void main() {
  const maps = {'ru': compiledStringsRu, 'en': compiledStringsEn};
  for (final code in kBuiltInStringLanguages) {
    final path = builtInStringsAsset(code);
    File(path).writeAsStringSync(encodeBuiltInStrings(maps[code]!));
    stdout.writeln('$path: ${maps[code]!.length} strings');
  }
}
