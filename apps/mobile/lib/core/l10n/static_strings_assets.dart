import 'dart:convert';

/// The languages whose strings are compiled into the phone app (and shipped
/// as web assets): Russian and English. See static_strings.dart.
const kBuiltInStringLanguages = ['ru', 'en'];

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
