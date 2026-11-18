import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_strings.dart' as native;
import 'package:lawbid/core/l10n/static_strings_assets.dart';
import 'package:lawbid/core/l10n/static_strings_compiled.dart';
import 'package:lawbid/core/l10n/static_strings_web.dart' as web;

/// Web bundle budget (17.11): the web build reads the compiled-in Russian
/// and English strings from assets/l10n/static_strings_<code>.json instead
/// of compiling the maps in (lib/core/l10n/static_strings.dart).
void main() {
  const maps = {'ru': compiledStringsRu, 'en': compiledStringsEn};

  for (final code in kBuiltInStringLanguages) {
    test('the $code asset is the compiled-in map, row for row', () {
      final asset = File(builtInStringsAsset(code)).readAsStringSync();
      expect(
        asset,
        encodeBuiltInStrings(maps[code]!),
        reason: 'Run `dart run tool/gen_static_strings.dart` in apps/mobile '
            'after changing lib/core/l10n/strings/*.dart.',
      );
      expect(decodeBuiltInStrings(asset), maps[code]);
    });
  }

  test('phones and tests answer from the constants, no read', () {
    expect(native.builtInStrings('ru'), same(compiledStringsRu));
    expect(native.builtInStrings('en'), same(compiledStringsEn));
    expect(native.builtInStrings('es'), isNull);
    expect(native.loadBuiltInStrings('ru'), isNull);
  });

  group('web', () {
    final reads = <String>[];
    setUp(() {
      web.resetBuiltInStrings();
      reads.clear();
      web.readBuiltInStringsAsset = (asset) async {
        reads.add(asset);
        return File(asset).readAsString();
      };
    });

    test('null until the asset is read, then the same strings', () async {
      expect(web.builtInStrings('ru'), isNull);
      await Future.wait([
        web.loadBuiltInStrings('ru')!,
        web.loadBuiltInStrings('ru')!,
      ]);
      expect(reads, [builtInStringsAsset('ru')]);
      expect(web.builtInStrings('ru'), compiledStringsRu);
      expect(web.loadBuiltInStrings('ru'), isNull);
    });

    test('a server-only language reads nothing', () {
      expect(web.loadBuiltInStrings('es'), isNull);
      expect(reads, isEmpty);
    });

    test('a failed read never throws and is tried again', () async {
      web.readBuiltInStringsAsset = (asset) async {
        reads.add(asset);
        throw Exception('offline');
      };
      await web.loadBuiltInStrings('en');
      expect(web.builtInStrings('en'), isNull);
      web.readBuiltInStringsAsset = (asset) => File(asset).readAsString();
      await web.loadBuiltInStrings('en');
      expect(web.builtInStrings('en'), compiledStringsEn);
    });
  });
}
