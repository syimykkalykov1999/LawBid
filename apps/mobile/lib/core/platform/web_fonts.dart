import 'package:lawbid/core/platform/web_fonts_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/web_fonts_web.dart'
    as impl;

/// Owner 2026-10-16 (web): the languages whose letters Inter has no glyphs
/// for (Indian scripts, Hebrew, Arabic, Thai, CJK...) showed as "NO GLYPH"
/// boxes on the web: the browser has no system fallback for the canvas, and
/// the engine's own font download is blocked on purpose (CSP, see
/// infra/modules/web). The fonts are small Noto files of our own
/// (`apps/mobile/web/fonts`), fetched only when a language needs them. On
/// the phones the system fonts do this job, so everything here is a no-op.
abstract final class WebFonts {
  /// Family names the web build registers; the theme lists them as the
  /// fallback of every text (unknown families are ignored on the phones).
  static const List<String> fallbackFamilies = [
    'LB Noto Names',
    'LB Noto arabic',
    'LB Noto hebrew',
    'LB Noto devanagari',
    'LB Noto bengali',
    'LB Noto gurmukhi',
    'LB Noto gujarati',
    'LB Noto tamil',
    'LB Noto telugu',
    'LB Noto kannada',
    'LB Noto malayalam',
    'LB Noto sinhala',
    'LB Noto thai',
    'LB Noto lao',
    'LB Noto khmer',
    'LB Noto myanmar',
    'LB Noto georgian',
    'LB Noto armenian',
    'LB Noto ethiopic',
    'LB Noto zh',
    'LB Noto zhtw',
    'LB Noto ja',
    'LB Noto ko',
  ];

  /// The language names of the picker (one 100 KB file for all scripts).
  static Future<void> ensureNames() => _bounded(impl.ensureFont('names'));

  /// The full font for the script of language [code] (nothing for Latin,
  /// Cyrillic and Greek: Inter has them).
  static Future<void> ensureLanguage(String code) {
    final script = _scriptOf[code];
    return script == null
        ? Future<void>.value()
        : _bounded(impl.ensureFont(script));
  }

  /// A slow network never holds the app back for long.
  static Future<void> _bounded(Future<void> load) =>
      load.timeout(const Duration(seconds: 5), onTimeout: () {});

  static const Map<String, String> _scriptOf = {
    'ar': 'arabic',
    'fa': 'arabic',
    'ur': 'arabic',
    'ps': 'arabic',
    'he': 'hebrew',
    'hi': 'devanagari',
    'mr': 'devanagari',
    'ne': 'devanagari',
    'bn': 'bengali',
    'pa': 'gurmukhi',
    'gu': 'gujarati',
    'ta': 'tamil',
    'te': 'telugu',
    'kn': 'kannada',
    'ml': 'malayalam',
    'si': 'sinhala',
    'th': 'thai',
    'lo': 'lao',
    'km': 'khmer',
    'my': 'myanmar',
    'ka': 'georgian',
    'hy': 'armenian',
    'am': 'ethiopic',
    'zh': 'zh',
    'zh-tw': 'zhtw',
    'ja': 'ja',
    'ko': 'ko',
  };
}
