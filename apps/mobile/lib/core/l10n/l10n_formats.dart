import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'app_language.dart';
import 'language_providers.dart';

/// Dates/numbers/currency formatted for the selected interface language
/// (docs/01_FOUNDATION_AUTH.md §9.4: "Даты/числа/валюта форматируются
/// через `intl` по выбранной локали"). Widgets use
/// `ref.watch(l10nFormatsProvider)` — never `DateTime.toString()` or
/// hand-built strings.
///
/// Date symbols come from `initializeDateFormatting()` (called in
/// `L10nCacheController.bootstrap`). A language intl has no data for
/// (possible for a server-only language) formats as English rather than
/// throwing.
class L10nFormats {
  L10nFormats(AppLanguage language)
      : locale = Intl.verifiedLocale(
              language.code,
              DateFormat.localeExists,
              onFailure: (_) => AppLanguage.fallback.code,
            ) ??
            AppLanguage.fallback.code;

  /// The intl locale actually used (the language code, or `en`).
  final String locale;

  /// Server timestamps are UTC ISO-8601 (`.cursorrules`); users see local
  /// time.
  DateTime _local(DateTime value) => value.isUtc ? value.toLocal() : value;

  /// `Sep 27, 2026` / `27 сент. 2026 г.`
  String date(DateTime value) => DateFormat.yMMMd(locale).format(_local(value));

  /// `September 27, 2026` / `27 сентября 2026 г.`
  String dateLong(DateTime value) => DateFormat.yMMMMd(locale).format(_local(value));

  /// `3:05 PM` / `15:05`
  String time(DateTime value) => DateFormat.jm(locale).format(_local(value));

  /// Date + time, e.g. `Sep 27, 2026, 3:05 PM`.
  String dateTime(DateTime value) =>
      DateFormat.yMMMd(locale).add_jm().format(_local(value));

  /// `1,234.5` / `1 234,5`
  String number(num value) => NumberFormat.decimalPattern(locale).format(value);

  /// Money is stored in integer cents (`.cursorrules`): `$1,234.50` /
  /// `1 234,50 $`.
  String currencyFromCents(int cents, {String currencyCode = 'USD'}) =>
      NumberFormat.simpleCurrency(locale: locale, name: currencyCode).format(cents / 100);
}

final l10nFormatsProvider = Provider<L10nFormats>((ref) {
  final language = ref.watch(languageControllerProvider).value ?? AppLanguage.fallback;
  return L10nFormats(language);
});
