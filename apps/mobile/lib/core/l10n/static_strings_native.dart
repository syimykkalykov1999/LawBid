import 'package:lawbid/core/l10n/static_strings_assets.dart';
import 'package:lawbid/core/l10n/static_strings_compiled.dart';

/// The compiled-in strings for [code] (`ru`, `en`), or `null` for a language
/// that only exists on the server. See static_strings.dart.
Map<String, String>? builtInStrings(String code) => switch (code) {
      'en' => compiledStringsEn,
      'ru' => compiledStringsRu,
      _ => null,
    };

/// Nothing to read here: the strings are compiled in. `null`, so a caller
/// does not add an `await` (and a frame) where there was none before.
Future<void>? loadBuiltInStrings(String code) => null;

/// Nothing to wait for: the strings are compiled in. `null`, so the start
/// sequence does not add an `await` before the first frame.
Future<bool>? waitForBuiltInStrings(
  String code, {
  List<Duration> retryDelays = kBuiltInStringsRetryDelays,
}) =>
    null;
