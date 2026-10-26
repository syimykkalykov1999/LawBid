import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/plural_rules.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';

import '../../../helpers/long_locale.dart';
import '../../../helpers/ux_harness.dart';

/// Owner 2026-10-23: the Q&A list in the four themes (Day, Night, Blue,
/// Green): a normal question, a solved one with a long title, a closed one;
/// plus the same cards with the longest texts of every language.
Question _q(
  String id,
  String title,
  String body, {
  String? best,
  bool closed = false,
  int answers = 3,
}) =>
    Question(
      id: id,
      title: title,
      body: body,
      isAnonymous: true,
      isMine: false,
      answerCount: answers,
      canAnswer: true,
      createdAt: DateTime.now().subtract(const Duration(hours: 5)),
      practiceArea: const QaPracticeArea(
        id: 'p',
        i18nKey: 'practice.family',
        nameEn: 'Family law',
      ),
      stateCode: 'NY',
      bestAnswerId: best,
      closed: closed,
    );

Widget _list() => Container(
      color: Colors.transparent,
      padding: const EdgeInsets.all(16),
      child: Builder(
        builder: (context) {
          final bg = Theme.of(context).extension<AppColorTokens>()!.bg;
          return ColoredBox(
            color: bg,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                QuestionCard(
                  question: _q(
                    '1',
                    'Can my landlord keep the deposit?',
                    'I moved out last month and the flat was clean.',
                  ),
                  onTap: () {},
                ),
                const SizedBox(height: 12),
                QuestionCard(
                  question: _q(
                    '2',
                    'My employer changed my contract terms without asking '
                        'me and now says I agreed by staying on the job',
                    'Is that legal in my state, and what can I do before the '
                        'new terms start next month?',
                    best: 'a1',
                    answers: 7,
                  ),
                  onTap: () {},
                ),
                const SizedBox(height: 12),
                QuestionCard(
                  question: _q('3', 'Old question', 'Nobody answered.',
                      closed: true, answers: 0,),
                  onTap: () {},
                ),
              ],
            ),
          );
        },
      ),
    );

/// English texts; an unknown key (a practice area) falls back to its key.
class _En implements Translator {
  static const _en = StaticTranslatorEn();

  @override
  String t(String key, [Map<String, String>? params]) =>
      interpolate(_en.seedEntries[key] ?? key, params);

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      pluralize(
        languageCode: 'en',
        key: key,
        count: count,
        lookup: (k) => _en.seedEntries[k],
        params: params,
      );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await loadAppFonts();
  });

  for (final id in AppThemeId.values) {
    testGoldens('Q&A question cards - ${id.name}', (tester) async {
      await tester.pumpWidgetBuilder(
        ProviderScope(
          overrides: uxOverrides(translator: _En()),
          child: _list(),
        ),
        wrapper: materialAppWrapper(theme: AppTheme.of(id)),
        surfaceSize: const Size(360, 560),
      );
      await screenMatchesGolden(tester, 'qa_cards_${id.name}');
    });
  }

  testWidgets('question card with the longest texts fits 320 dp, x1.6', (
    tester,
  ) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(320, 900);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        Scaffold(body: SingleChildScrollView(child: _list())),
        theme: AppTheme.light(),
        size: const Size(320, 900),
        textScale: 1.6,
        overrides: uxOverrides(translator: LongestTranslator()),
      ),
    );
    await tester.pump();
    expect(tester.takeException(), isNull);
  });
}
