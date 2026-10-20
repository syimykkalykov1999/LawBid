/// Owner 2026-10-18: one way to match what people type against names and
/// short texts the app filters itself — any case, accents, ё = е, Cyrillic
/// or Latin («Эмили» = "Emily»), any word order, a small typo.
///
/// [nameSkeleton] follows the server's `public.f_name_skel` rule for rule
/// (apps/api/prisma/migrations/20261018140000_name_search_skeleton) — the
/// two share test vectors (test/core/text/search_fold_test.dart and the
/// people-search e2e), so a list filtered here and a list from the server
/// find the same people.
library;

const _accents = {
  'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'ā': 'a', //
  'ă': 'a', 'ą': 'a', 'ç': 'c', 'ć': 'c', 'č': 'c', 'ď': 'd', 'è': 'e', //
  'é': 'e', 'ê': 'e', 'ë': 'e', 'ē': 'e', 'ę': 'e', 'ě': 'e', 'ğ': 'g', //
  'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i', 'ī': 'i', 'ı': 'i', 'ł': 'l', //
  'ñ': 'n', 'ń': 'n', 'ň': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o', //
  'ö': 'o', 'ø': 'o', 'ō': 'o', 'ő': 'o', 'ř': 'r', 'ś': 's', 'š': 's', //
  'ş': 's', 'ș': 's', 'ť': 't', 'ț': 't', 'ù': 'u', 'ú': 'u', 'û': 'u', //
  'ü': 'u', 'ū': 'u', 'ů': 'u', 'ű': 'u', 'ý': 'y', 'ÿ': 'y', 'ź': 'z', //
  'ż': 'z', 'ž': 'z', 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ё': 'е',
};

/// Lower case, no accents, ё = е, one space between words.
String searchFold(String s) {
  final lower = s.toLowerCase();
  final out = StringBuffer();
  for (final ch in lower.split('')) {
    out.write(_accents[ch] ?? ch);
  }
  return out.toString().trim().replaceAll(RegExp(r'\s+'), ' ');
}

const _cyrSingle = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'з': 'z', //
  'и': 'i', 'й': 'i', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', //
  'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'ы': 'i', //
  'э': 'e', 'і': 'i', 'ї': 'i', 'є': 'e', 'ң': 'n', 'ө': 'o', 'ү': 'u', //
  'ґ': 'g', 'х': '', 'ь': '', 'ъ': '',
};
const _latSingle = {'y': 'i', 'j': 'i', 'w': 'u', 'q': 'k', 'c': 'k'};

/// The spelling skeleton of a name: the same text whether it was written in
/// Cyrillic or Latin, with "y" or "i", one letter or two.
String nameSkeleton(String s) {
  var t = searchFold(s)
      .replaceAll('дж', 'j')
      .replaceAll('щ', 'ш')
      .replaceAll('ц', 'ts')
      .replaceAll('ю', 'iu')
      .replaceAll('я', 'ia')
      .replaceAll('ph', 'f')
      .replaceAll('ch', 'ч')
      .replaceAll('sh', 'ш')
      .replaceAll('zh', 'ж')
      .replaceAll('kh', '');
  final b = StringBuffer();
  for (final ch in t.split('')) {
    final c = _cyrSingle[ch] ?? ch;
    b.write(_latSingle[c] ?? c);
  }
  t = b.toString().replaceAll('x', 'ks').replaceAll('h', '');
  return t.replaceAllMapped(RegExp(r'(.)\1+'), (m) => m[1]!);
}

/// The consonants of [nameSkeleton] with the hissing sounds as one —
/// names written by how they sound («Рэйчел» = "Rachel").
String nameConsonants(String s) => nameSkeleton(s)
    .replaceAll(RegExp('[aeiou]'), '')
    .replaceAll(RegExp('[чшжz]'), 's')
    .replaceAllMapped(RegExp(r'(.)\1+'), (m) => m[1]!);

/// The words of [query] (folded), without a leading '@' / '#'.
List<String> searchWords(String query) => [
      for (final w in searchFold(query).split(' '))
        if (w.replaceFirst(RegExp('^[@#]+'), '').isNotEmpty)
          w.replaceFirst(RegExp('^[@#]+'), ''),
    ];

/// Whether every word of [query] is found in [fields]: as text, in another
/// alphabet or spelling, by its consonants (3+), or with one typo (4+
/// letters). An empty query matches everything.
bool textMatches(String query, Iterable<String?> fields) {
  final words = searchWords(query);
  if (words.isEmpty) return true;
  final hay = [
    for (final f in fields)
      if (f != null && f.trim().isNotEmpty) searchFold(f),
  ];
  if (hay.isEmpty) return false;
  final all = hay.join(' ');
  final skel = nameSkeleton(all);
  final cons = nameConsonants(all);
  final hayWords = all.split(' ');
  return words.every((w) {
    if (all.contains(w)) return true;
    final ws = nameSkeleton(w);
    if (ws.isNotEmpty && skel.contains(ws)) return true;
    final wc = nameConsonants(w);
    if (wc.length >= 3 && cons.contains(wc)) return true;
    if (w.length >= 4) {
      for (final h in hayWords) {
        final head = h.length > w.length ? h.substring(0, w.length) : h;
        if (_withinOne(w, head) || _withinOne(w, h)) return true;
      }
    }
    return false;
  });
}

/// Levenshtein distance ≤ 1.
bool _withinOne(String a, String b) {
  if (a == b) return true;
  final la = a.length;
  final lb = b.length;
  if ((la - lb).abs() > 1) return false;
  var i = 0;
  var j = 0;
  var edits = 0;
  while (i < la && j < lb) {
    if (a[i] == b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la > lb) {
      i++;
    } else if (lb > la) {
      j++;
    } else {
      i++;
      j++;
    }
  }
  return edits + (la - i) + (lb - j) <= 1;
}
