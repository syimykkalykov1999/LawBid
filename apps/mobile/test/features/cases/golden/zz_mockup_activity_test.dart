// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cover.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cover_picker.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

import '../../../helpers/ux_harness.dart';

/// Russian with English for keys only the server bundle carries.
class _Ru implements Translator {
  const _Ru();
  static const _ru = StaticTranslatorRu();
  static const _en = StaticTranslatorEn();

  // Practice names come from the server bundle.
  static const _practices = {
    'practice.immigration': 'Иммиграция',
    'practice.family_law': 'Семейное право',
    'practice.personal_injury': 'Травмы и ДТП',
    'practice.criminal_defense': 'Уголовная защита',
  };

  Translator _for(String key) => _ru.seedEntries.containsKey(key) ? _ru : _en;

  @override
  String t(String key, [Map<String, String>? params]) {
    final practice = _practices[key];
    if (practice != null) return practice;
    if (!_ru.seedEntries.containsKey(key) &&
        !_en.seedEntries.containsKey(key)) {
      return key;
    }
    return _for(key).t(key, params);
  }

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      _for('$key.other').plural(key, count, params);
}

/// The covers are drawn (gradients, blurred glows, thin strokes), and
/// their anti-aliasing differs by a fraction of a percent between the Mac
/// that rendered these goldens and the CI runner. Up to 1% of pixels
/// may differ; a real layout or colour change moves far more.
/// Owner 2026-10-15: the compact feed (many small texts) drifts 2.03% /
/// 2.06% on the macOS 26 runner while a local render is byte-identical to
/// the golden, so the compact pair is allowed 3%.
class _TolerantComparator extends LocalFileComparator {
  _TolerantComparator(super.testFile, {this.maxDiff = 0.01});

  final double maxDiff;

  @override
  Future<bool> compare(Uint8List imageBytes, Uri golden) async {
    final result = await GoldenFileComparator.compareLists(
      imageBytes,
      await getGoldenBytes(golden),
    );
    if (result.passed || result.diffPercent <= maxDiff) {
      result.dispose();
      return true;
    }
    final error = await generateFailureOutput(result, golden, basedir);
    result.dispose();
    throw FlutterError(error);
  }
}

FeedCase _case({
  required String id,
  required String category,
  required String categoryName,
  required String leaf,
  required String title,
  required String excerpt,
  required String state,
  String? city,
  List<String> extra = const [],
  int? budgetCents,
  CaseUrgency? urgency,
  String? coverKey,
  bool isNew = false,
  CaseDossier dossier = CaseDossier.empty,
}) =>
    FeedCase(
      id: id,
      title: title,
      excerpt: excerpt,
      practice: PracticeRef(
        id: 'p-$id',
        code: '$category.$leaf',
        i18nKey: 'practice.$category.$leaf',
        nameEn: categoryName,
        categoryI18nKey: 'practice.$category',
        categoryNameEn: categoryName,
        categoryCode: category,
      ),
      primaryStateCode: state,
      additionalStateCodes: extra,
      city: city,
      status: CaseStatus.open,
      budget: CaseBudget(
        mode: budgetCents == null ? BudgetMode.clarifyLater : BudgetMode.amount,
        amountCents: budgetCents,
      ),
      viewCount: 128,
      bidsCount: 3,
      createdAt: DateTime(2026, 10, 4, 12),
      isNew: isNew,
      hasOwnBid: false,
      urgency: urgency,
      coverKey: coverKey,
      dossier: dossier,
    );

final _cases = [
  _case(
    id: 'c-1',
    category: 'immigration',
    categoryName: 'Immigration',
    leaf: 'visas',
    title: 'Work visa renewal before my H-1B expires',
    excerpt:
        'My H-1B ends in six weeks and my employer filed late. I need help with the extension and a backup plan.',
    state: 'CA',
    city: 'Los Angeles',
    extra: ['NV'],
    budgetCents: 300000,
    urgency: CaseUrgency.urgent,
    coverKey: 'art:2',
    isNew: true,
    dossier: const CaseDossier(
      imagesCount: 2,
      documentsCount: 3,
      descriptionLength: 640,
    ),
  ),
  _case(
    id: 'c-2',
    category: 'family_law',
    categoryName: 'Family law',
    leaf: 'divorce',
    title: 'Uncontested divorce, shared custody of two kids',
    excerpt:
        'We agree on almost everything and want to file together. Need an attorney to draft and file the papers.',
    state: 'NY',
    city: 'Brooklyn',
    budgetCents: 250000,
    urgency: CaseUrgency.soon,
    coverKey: 'art:3',
    dossier: const CaseDossier(documentsCount: 1, descriptionLength: 310),
  ),
  _case(
    id: 'c-3',
    category: 'personal_injury',
    categoryName: 'Personal injury',
    leaf: 'car_accidents',
    title: 'Rear-ended on I-95, back injury, insurer stalling',
    excerpt:
        'The other driver was cited. The insurer keeps asking for more documents and has not made an offer.',
    state: 'FL',
    urgency: CaseUrgency.flexible,
    coverKey: 'icon:car',
    dossier: const CaseDossier(imagesCount: 4, descriptionLength: 120),
  ),
  _case(
    id: 'c-4',
    category: 'criminal_defense',
    categoryName: 'Criminal defense',
    leaf: 'misdemeanors',
    title: 'First-time shoplifting charge, court date next month',
    excerpt:
        'No prior record. Looking for someone to represent me at the hearing.',
    state: 'TX',
    city: 'Austin',
    budgetCents: 150000,
    coverKey: 'art:1',
    dossier: const CaseDossier(descriptionLength: 70),
  ),
];

void main() {
  final themes = {'light': AppTheme.light(), 'dark': AppTheme.dark()};
  late final L10nFormats formats;
  setUpAll(() async {
    await initializeDateFormatting();
    formats = L10nFormats(AppLanguage.fallback);
  });
  const acts = [
    ClientActivity(online: true, respondsWithinDay: true),
    ClientActivity(lastSeenDays: 2),
    ClientActivity(lastSeenDays: 0, respondsWithinDay: true),
  ];
  for (final entry in themes.entries) {
    testGoldens('mockup activity - ${entry.key}', (tester) async {
      await tester.pumpWidgetBuilder(
        Scaffold(
          body: ListView(
            children: [
              for (var i = 0; i < 3; i++) ...[
                FeedCaseCard(
                  item: _cases[i],
                  t: const _Ru(),
                  formats: formats,
                  onTap: () {},
                  activity: acts[i],
                ),
                const SizedBox(height: 12),
              ],
            ],
          ),
        ),
        wrapper: (child) => uxApp(
          child,
          theme: entry.value,
          overrides: uxOverrides(translator: const _Ru()),
          size: const Size(390, 900),
          disableAnimations: true,
        ),
        surfaceSize: const Size(390, 900),
      );
      await screenMatchesGolden(tester, 'mockup_activity_${entry.key}');
    });
  }
}
