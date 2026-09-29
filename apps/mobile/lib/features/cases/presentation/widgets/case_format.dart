import 'package:intl/intl.dart';

import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

/// Display rules for docs/04 values. Money is integer cents; whole-dollar
/// amounts drop the ".00" (`$600`, docs/04 §4.2 card).
abstract final class CaseFormat {
  static String money(L10nFormats f, int cents) {
    final whole = cents % 100 == 0;
    return NumberFormat.simpleCurrency(
      locale: f.locale,
      name: 'USD',
      decimalDigits: whole ? 0 : 2,
    ).format(cents / 100);
  }

  /// "$600", "$250/hr" or "Free consultation".
  static String terms(Translator t, L10nFormats f, FeeType type, int cents) =>
      switch (type) {
        FeeType.freeConsultation => t.t('cases.fee.free'),
        FeeType.hourly => t.t('cases.fee.perHour', {'amount': money(f, cents)}),
        _ => money(f, cents),
      };

  static String feeTypeLabel(Translator t, FeeType type) => switch (type) {
        FeeType.hourly => t.t('cases.fee.hourly'),
        FeeType.freeConsultation => t.t('cases.fee.free'),
        _ => t.t('cases.fee.fixed'),
      };

  /// "$600" or "Clarify later" (docs/04 §4.2).
  static String budget(Translator t, L10nFormats f, CaseBudget b) =>
      b.isClarifyLater
          ? t.t('cases.budget.clarifyLater')
          : money(f, b.amountCents!);

  /// "Trenton, NJ" / "NJ +2" (docs/04 §4.2: primary + "+N").
  static String place(String? city, String primary, int extraStates) {
    final base = (city == null || city.trim().isEmpty)
        ? primary
        : '${city.trim()}, $primary';
    return extraStates > 0 ? '$base +$extraStates' : base;
  }

  /// Practice name through its i18n key, English name as the fallback.
  static String practice(Translator t, String i18nKey, String nameEn) {
    final v = t.t(i18nKey);
    return v == i18nKey ? nameEn : v;
  }

  static String startLabel(
    Translator t,
    L10nFormats f,
    StartAvailability s,
    DateTime? date,
  ) =>
      switch (s) {
        StartAvailability.withinWeek => t.t('cases.start.withinWeek'),
        StartAvailability.customDate when date != null =>
          t.t('cases.start.onDate', {'date': f.date(date)}),
        _ => t.t('cases.start.immediately'),
      };
}
