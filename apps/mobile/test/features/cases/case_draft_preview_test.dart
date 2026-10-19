import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/attorney_view_preview.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';

import '../../helpers/ux_harness.dart';

/// Practice names come from the server bundle; the rest is compiled in.
class _Ru implements Translator {
  const _Ru();
  static const _ru = StaticTranslatorRu();
  static const _en = StaticTranslatorEn();
  static const _practices = {
    'practice.medical_malpractice': 'Врачебные ошибки',
    'practice.medical_malpractice.surgical_errors': 'Хирургические ошибки',
  };

  @override
  String t(String key, [Map<String, String>? params]) =>
      _practices[key] ?? _for(key).t(key, params);

  Translator _for(String key) => _ru.seedEntries.containsKey(key) ? _ru : _en;

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      _for('$key.other').plural(key, count, params);
}

/// Owner 2026-10-19: «Как выглядит ваш кейс» on the wizard's last step —
/// the attorneys' feed card built from the draft, practice colour included,
/// files only as counts.
Future<void> main() async {
  await initializeDateFormatting('ru');

  const draft = CaseDraft(
    practiceAreaId: 'p1',
    practiceI18nKey: 'practice.medical_malpractice.surgical_errors',
    practiceNameEn: 'Surgical Errors',
    practiceCode: 'medical_malpractice.surgical_errors',
    title: 'Ошибка при операции на колене',
    description: 'После операции нога не сгибается, врач не отвечает.',
    privateDetails: 'Клиника «Здоровье», хирург Иванов',
    primaryStateCode: 'NY',
    city: 'Brooklyn',
    budgetIsPercent: true,
    budgetPercentBps: 3300,
    urgency: 'urgent',
  );
  final files = [
    CasePhotoUpload(key: 1, bytes: Uint8List(0)),
    CasePhotoUpload(key: 2, bytes: Uint8List(0), name: 'video.mp4'),
    CasePhotoUpload(key: 3, bytes: Uint8List(0), name: 'report.pdf'),
  ];

  test('the draft becomes the attorneys\' card data', () {
    final item = AttorneyViewPreview.feedViewOfDraft(draft, files);
    expect(item.title, 'Ошибка при операции на колене');
    expect(item.practice.artCode, 'medical_malpractice');
    expect(item.budget.mode, BudgetMode.percent);
    expect(item.budget.percentBps, 3300);
    expect(item.urgency, CaseUrgency.urgent);
    expect(item.dossier.imagesCount, 2); // photo + video
    expect(item.dossier.documentsCount, 1);
    expect(item.dossier.privateDetailsLength, greaterThan(0));
    expect(item.privateDetails, isNull);
    expect(item.photos, isEmpty);
  });

  testWidgets('the sheet shows the feed card without private details', (
    tester,
  ) async {
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: SingleChildScrollView(
            child: AttorneyViewPreview(
              item: AttorneyViewPreview.feedViewOfDraft(draft, files),
              t: const _Ru(),
              formats: L10nFormats(AppLanguage.ru),
            ),
          ),
        ),
        theme: AppTheme.light(),
        size: const Size(390, 900),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.byType(FeedCaseCard), findsOneWidget);
    expect(find.textContaining('Ошибка при операции'), findsWidgets);
    expect(find.textContaining('хирург Иванов'), findsNothing);
  });
}
