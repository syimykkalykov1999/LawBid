// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/ux_harness.dart';

/// Russian with English for keys only the server bundle carries.
class _Ru implements Translator {
  const _Ru();
  static const _ru = StaticTranslatorRu();
  static const _en = StaticTranslatorEn();

  Translator _for(String key) => _ru.seedEntries.containsKey(key) ? _ru : _en;

  @override
  String t(String key, [Map<String, String>? params]) =>
      _for(key).t(key, params);

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      _for('$key.other').plural(key, count, params);
}

Widget _step() => Scaffold(
      body: EssenceStep(
        draft: const CaseDraft(),
        onChange: (_) {},
        footer: const CasePhotosPicker(),
      ),
    );

void main() {
  const size = Size(390, 1000);
  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });
  List<Override> overrides(Translator t) => [
        ...uxOverrides(translator: t),
        sharedPreferencesProvider.overrideWithValue(prefs),
      ];

  for (final entry in {
    'light': AppTheme.light(),
    'dark': AppTheme.dark(),
  }.entries) {
    testGoldens('essence step (ru) - ${entry.key}', (tester) async {
      await tester.pumpWidgetBuilder(
        _step(),
        wrapper: (child) => uxApp(
          child,
          theme: entry.value,
          overrides: overrides(const _Ru()),
          size: size,
          disableAnimations: true,
        ),
        surfaceSize: size,
      );
      await tester.pump();
      await screenMatchesGolden(tester, 'essence_step_${entry.key}');
    });
  }

  for (final lang in {
    'ru': (
      tr: const _Ru(),
      texts: [
        'Видят все адвокаты',
        '· без вашего имени',
        'Кратко о деле',
        'Без паспорта, SSN, номеров счетов, имён и адресов.',
        'Увидит только адвокат, чей бид вы примете',
        'Подробности (необязательно)',
        'Фото и файлы',
        '· необязательно',
        'До 9 фото и видео и до 3 документов (PDF, Word).',
        'Фото',
        'Файл',
        '0 / 9',
        'Откроется только после того, как вы примете бид.',
        'LawBid не юридическая фирма и не даёт консультаций.',
      ],
    ),
    'en': (
      tr: const StaticTranslatorEn(),
      texts: [
        'Every attorney sees this',
        '· without your name',
        'Case in brief',
        'No passport, SSN, account numbers, names or addresses.',
        'Only the attorney whose bid you accept sees this',
        'Details (optional)',
        'Photos and files',
        '· optional',
        'Up to 9 photos and videos and up to 3 documents (PDF, Word).',
        'Photo',
        'File',
        '0 / 9',
        'Opens only after you accept a bid.',
        'LawBid is not a law firm and gives no legal advice.',
      ],
    ),
  }.entries) {
    testWidgets('essence step renders new texts (${lang.key})', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        uxApp(
          _step(),
          theme: AppTheme.light(),
          overrides: overrides(lang.value.tr),
          size: size,
          disableAnimations: true,
        ),
      );
      await tester.pump();
      for (final text in lang.value.texts) {
        expect(
          find.textContaining(text, findRichText: true),
          findsWidgets,
          reason: text,
        );
      }
      expect(find.byKey(const ValueKey('case-public-block')), findsOneWidget);
      expect(find.byKey(const ValueKey('case-private-block')), findsOneWidget);
    });
  }

  testWidgets('private details typed into the draft', (tester) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    var draft = const CaseDraft();
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: EssenceStep(draft: draft, onChange: (f) => draft = f(draft)),
        ),
        theme: AppTheme.light(),
        overrides: overrides(const StaticTranslatorEn()),
        size: size,
        disableAnimations: true,
      ),
    );
    await tester.enterText(find.byType(TextField).last, 'Ivan, 12 Elm St');
    expect(draft.privateDetails, 'Ivan, 12 Elm St');
    expect(draft.description, '');
  });

  testWidgets('feed card line says private details are locked', (tester) async {
    await tester.pumpWidget(
      uxApp(
        const Scaffold(
          body: CaseFileLine(
            t: _Ru(),
            dossier: CaseDossier(
              documentsCount: 1,
              imagesCount: 2,
              privateDetailsLength: 400,
            ),
          ),
        ),
        theme: AppTheme.light(),
        overrides: overrides(const _Ru()),
        disableAnimations: true,
      ),
    );
    expect(
      find.textContaining('Закрытые детали: подробное описание'),
      findsOneWidget,
    );
  });
}
