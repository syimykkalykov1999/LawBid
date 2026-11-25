import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_catalog_provider.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart'
    show stateName;
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid/features/practice/practice_options.dart';

/// Owner 18.11 («все 85 языков»): the same list as the app's language
/// settings and the attorney profiles — the curated catalogue plus every
/// active `GET /i18n/languages` language. The compiled-in catalogue while
/// the server list loads.
List<LanguageCatalogEntry> hotlineLanguages(WidgetRef ref) =>
    ref.watch(languageCatalogProvider).value ?? kLanguageCatalog;

/// A language's own name («Русский», «English»), the code when unknown.
String hotlineLanguageName(List<LanguageCatalogEntry> list, String code) =>
    list.where((l) => l.code == code).firstOrNull?.nativeName ?? code;

/// «по-русски или по-английски» (ru) / «Russian or English» (en): the
/// languages as the sentence «Ищем адвоката, говорящего …» needs them.
String hotlineSpeaks(
  Translator t,
  List<String> codes,
  String Function(String code) name,
) {
  String one(String code) {
    final key = 'hotline.c.speak.$code';
    final v = t.t(key);
    return v == key ? t.t('hotline.c.speak.other', {'name': name(code)}) : v;
  }

  return codes.map(one).join(t.t('hotline.c.langs.or'));
}

/// «1-й», «2–5-й»… for the rough place the server gives.
String hotlinePlace(Translator t, String? band) =>
    band == null ? '' : t.t('hotline.c.pos.$band');

/// «Ожидание до 5 минут. » or nothing.
String hotlineWait(Translator t, String? band) =>
    band == null ? '' : t.t('hotline.c.wait.$band');

/// A banded counter: '0' = «нет», '1' = «есть», '10+' as is.
String hotlineBand(Translator t, String raw, {bool lawyers = false}) =>
    switch (raw) {
      '0' => t.t(lawyers ? 'hotline.c.band.busy' : 'hotline.c.band.none'),
      '1' => t.t('hotline.c.band.some'),
      _ => raw,
    };

/// «Семейное право · Невада · Русский, English».
String hotlineSummary(
  WidgetRef ref,
  Translator t,
  HotlineDraft d,
  List<LanguageCatalogEntry> langs,
) =>
    t.t('hotline.c.summary', {
      'practice': practiceLabel(ref, d.practice),
      'state': stateName(d.state),
      'langs': d.languages.map((c) => hotlineLanguageName(langs, c)).join(', '),
    });

/// What an ended request says, by the server's reason.
String hotlineEndText(Translator t, String? reason) => switch (reason) {
      'notify_exhausted' => t.t('hotline.c.end.exhausted'),
      'notify_expired' => t.t('hotline.c.end.expired'),
      'queue_full' => t.t('hotline.c.end.full'),
      'time_limit' => t.t('hotline.c.end.timeLimit'),
      'ended' => t.t('hotline.c.end.done'),
      _ => t.t('hotline.c.end.lost'),
    };

/// A refusal's text (null = nothing to say).
String? hotlineErrorText(Translator t, String? code) => switch (code) {
      null => null,
      'RATE_LIMITED' => t.t('hotline.c.err.rate'),
      'FEATURE_DISABLED' => t.t('hotline.c.err.off'),
      'NETWORK' => t.t('hotline.c.err.network'),
      'PHONE_NOT_VERIFIED' => t.t('hotline.c.err.phone'),
      _ => t.t('hotline.c.end.lost'),
    };
