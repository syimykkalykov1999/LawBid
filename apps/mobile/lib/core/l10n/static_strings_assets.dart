import 'dart:convert';

/// The languages whose strings are compiled into the phone app (and shipped
/// as web assets): Russian and English. See static_strings.dart.
const kBuiltInStringLanguages = ['ru', 'en'];

/// Web start: the pauses between tries when reading the strings fails
/// (about 15 s in all, then the cached translations answer). boot_head.js
/// already repeats a dropped download of the app's own files three times.
const kBuiltInStringsRetryDelays = [
  Duration(milliseconds: 500),
  Duration(seconds: 1),
  Duration(seconds: 2),
  Duration(seconds: 4),
  Duration(seconds: 8),
];

/// The web asset with the compiled-in strings of [code].
String builtInStringsAsset(String code) =>
    'assets/l10n/static_strings_$code.json';

/// The asset text for [strings]: one `"key": "value"` row per line, in map
/// order, so a changed string is a one-line diff
/// (tool/gen_static_strings.dart writes it).
String encodeBuiltInStrings(Map<String, String> strings) {
  final rows = strings.entries
      .map((e) => '${jsonEncode(e.key)}: ${jsonEncode(e.value)}')
      .join(',\n');
  return '{\n$rows\n}\n';
}

/// The strings of one asset (see [encodeBuiltInStrings]).
Map<String, String> decodeBuiltInStrings(String source) =>
    (jsonDecode(source) as Map<String, dynamic>).cast<String, String>();
