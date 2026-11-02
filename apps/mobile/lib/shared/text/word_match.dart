/// Audit 2026-11-02: one rule for every on-device list filter (contacts,
/// forward / share sheets, groups in the chat list, group composer, people
/// pickers) — the way WhatsApp does it: case and accents are ignored and
/// every typed word must START a word of the name ("ив пет" finds "Иван
/// Петров", "ван" does not). Chinese / Japanese / Korean have no spaces, so
/// there the text may sit anywhere.
library;

final _cjk = RegExp(
  '[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]',
);
final _notWord = RegExp(r'[^\p{L}\p{N}]+', unicode: true);
final _marks = RegExp('[\u0300-\u036f]');

const _fold = <String, String>{
  'ё': 'е',
  'ß': 'ss',
  'ø': 'o',
  'đ': 'd',
  'ł': 'l',
  'æ': 'ae',
  'œ': 'oe',
  'ı': 'i',
  'à': 'a',
  'á': 'a',
  'â': 'a',
  'ã': 'a',
  'ä': 'a',
  'å': 'a',
  'ā': 'a',
  'ç': 'c',
  'ć': 'c',
  'č': 'c',
  'è': 'e',
  'é': 'e',
  'ê': 'e',
  'ë': 'e',
  'ē': 'e',
  'ě': 'e',
  'ę': 'e',
  'ì': 'i',
  'í': 'i',
  'î': 'i',
  'ï': 'i',
  'ī': 'i',
  'ñ': 'n',
  'ń': 'n',
  'ň': 'n',
  'ò': 'o',
  'ó': 'o',
  'ô': 'o',
  'õ': 'o',
  'ö': 'o',
  'ō': 'o',
  'ő': 'o',
  'ř': 'r',
  'ś': 's',
  'š': 's',
  'ş': 's',
  'ť': 't',
  'ù': 'u',
  'ú': 'u',
  'û': 'u',
  'ü': 'u',
  'ū': 'u',
  'ů': 'u',
  'ű': 'u',
  'ý': 'y',
  'ÿ': 'y',
  'ź': 'z',
  'ž': 'z',
  'ż': 'z',
};

/// Lower case, accents removed, anything but letters / digits → one space.
String foldForSearch(String raw) {
  final b = StringBuffer();
  for (final r in raw.toLowerCase().replaceAll(_marks, '').runes) {
    final ch = String.fromCharCode(r);
    b.write(_fold[ch] ?? ch);
  }
  return b.toString().replaceAll(_notWord, ' ').trim();
}

/// Whether every word of [query] starts a word of some [fields] entry
/// (null entries are skipped). A blank [query] matches everything.
bool matchesWords(String query, Iterable<String?> fields) {
  final words = foldForSearch(query).split(' ').where((w) => w.isNotEmpty);
  if (words.isEmpty) return true;
  final parts = [
    for (final f in fields)
      if (f != null) foldForSearch(f),
  ];
  final hay = ' ${parts.join(' ')}';
  return words.every(
    (w) => _cjk.hasMatch(w) ? hay.contains(w) : hay.contains(' $w'),
  );
}
