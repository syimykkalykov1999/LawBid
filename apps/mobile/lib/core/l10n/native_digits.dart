/// Owner 2026-10-15: in languages that write their own digits (Nepali,
/// Marathi, Bengali, Arabic, Persian, Pashto, Burmese) every number the
/// user reads — counters, prices, dates, times, texts with `{n}` — is shown
/// in those digits, never 0–9. One rule, applied where text is produced:
/// the translator (after interpolation) and the formats (dates, numbers).
const _zeros = <String, int>{
  'ne': 0x0966, // Devanagari ०
  'mr': 0x0966,
  'bn': 0x09E6, // Bengali ০
  'ar': 0x0660, // Arabic-Indic ٠
  'fa': 0x06F0, // Extended Arabic-Indic ۰
  'ps': 0x06F0,
  'my': 0x1040, // Myanmar ၀
};

/// Whether [languageCode] writes its own digits.
bool hasNativeDigits(String languageCode) => _zeros.containsKey(languageCode);

/// Replaces ASCII 0–9 in [text] with the digits of [languageCode]; other
/// languages (and text with no digits) come back as they were.
String localizeDigits(String text, String languageCode) {
  final zero = _zeros[languageCode];
  if (zero == null) return text;
  final out = StringBuffer();
  for (final r in text.runes) {
    out.writeCharCode(r >= 0x30 && r <= 0x39 ? zero + (r - 0x30) : r);
  }
  return out.toString();
}
