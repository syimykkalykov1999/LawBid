import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/plural_rules.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// Worst case of every shipped language at once: for each key, the longest
/// translation among the languages the test fonts can draw (Latin,
/// Cyrillic, Greek). Built by `tool/gen_longest_strings.py` from the
/// translations workbook; a key missing there falls back to English.
class LongestTranslator implements Translator {
  factory LongestTranslator() => _instance ??= LongestTranslator._(
        (jsonDecode(
          File('test/l10n/longest_strings.json').readAsStringSync(),
        ) as Map<String, dynamic>)
            .cast<String, String>(),
      );

  LongestTranslator._(this._strings);

  static LongestTranslator? _instance;

  final Map<String, String> _strings;
  static const _en = StaticTranslatorEn();

  String? _lookup(String key) => _strings[key] ?? _en.seedEntries[key];

  @override
  String t(String key, [Map<String, String>? params]) =>
      interpolate(_lookup(key) ?? key, params);

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      pluralize(
        languageCode: 'en',
        key: key,
        count: count,
        lookup: _lookup,
        params: params,
      );
}

/// A narrow phone: 360 x 780 dp (Galaxy S-class / small Android).
const narrowPhone = Size(360, 780);

/// Sets the test view to [narrowPhone] for the rest of the test.
void useNarrowPhone(WidgetTester tester) {
  tester.view
    ..devicePixelRatio = 3
    ..physicalSize = narrowPhone * 3;
  addTearDown(tester.view.reset);
}
