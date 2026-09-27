import 'package:flutter/foundation.dart';

/// An interface language, identified by its ISO 639-1 code
/// (docs/01_FOUNDATION_AUTH.md §9.2: "остальные колонки код языка по ISO
/// 639-1 (`en`, `ru`, `es`, `zh`...). Новый язык = новая колонка").
///
/// Stage 1.6 (§9.4 + acceptance "новый язык, импортированный через xlsx,
/// появляется в приложении без пересборки"): this used to be
/// `enum AppLanguage { ru, en }`, which made every language beyond the two
/// compiled-in ones impossible without a rebuild. It is now a value class
/// keyed by [code], so a language that exists only on the server
/// (`GET /i18n/languages`) is a first-class [AppLanguage] too.
///
/// The enum-era API call sites rely on is kept: the [en]/[ru] constants,
/// [values] (the compiled-in languages) and [name] (== [code], what the
/// enum's `.name` returned). Equality is by [code].
@immutable
final class AppLanguage {
  const AppLanguage._(this.code);

  /// Normalizes [raw] (`'ES'`, `'es-MX'`, `'es_MX'` → `es`). Returns the
  /// canonical constant for the compiled-in languages so `identical` and
  /// `==` both hold for them.
  factory AppLanguage.fromCode(String raw) {
    final code = normalizeCode(raw);
    for (final builtIn in values) {
      if (builtIn.code == code) return builtIn;
    }
    return AppLanguage._(code);
  }

  /// file 01 §1: English is the default interface language and the
  /// fallback for any missing translation (§9.3 "Отсутствующий перевод →
  /// fallback на en").
  static const en = AppLanguage._('en');
  static const ru = AppLanguage._('ru');

  /// The default/fallback language — see [en].
  static const fallback = en;

  /// Languages whose strings are compiled into the app
  /// (static_translator.dart) and therefore work on a first, offline
  /// launch. Every other language comes from the server.
  static const List<AppLanguage> values = [en, ru];

  /// Lowercase ISO 639-1 code, e.g. `en`, `ru`, `es`.
  final String code;

  /// Enum-compatible alias of [code] (the old `AppLanguage.en.name`).
  String get name => code;

  bool get isBuiltIn => values.contains(this);

  /// `es-MX` / `es_MX` / `ES` → `es`. The server only knows bare ISO 639-1
  /// codes (`UpdateProfileDto.uiLanguage`: `/^[a-z]{2}$/`).
  static String normalizeCode(String raw) {
    final trimmed = raw.trim().toLowerCase();
    final cut = trimmed.indexOf(RegExp('[-_]'));
    return cut < 0 ? trimmed : trimmed.substring(0, cut);
  }

  /// Whether [raw] is a syntactically valid language code for the server
  /// (two lowercase letters after [normalizeCode]).
  static bool isValidCode(String raw) => RegExp(r'^[a-z]{2}$').hasMatch(normalizeCode(raw));

  @override
  bool operator ==(Object other) => other is AppLanguage && other.code == code;

  @override
  int get hashCode => code.hashCode;

  @override
  String toString() => 'AppLanguage($code)';
}
