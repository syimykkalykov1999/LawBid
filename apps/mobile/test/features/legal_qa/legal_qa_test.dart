import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderParagraph;
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';
import 'package:lawbid/features/legal_qa/presentation/ask_question_screen.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_feed_screen.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_widgets.dart';
import 'package:lawbid/features/legal_qa/presentation/question_detail_screen.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';

final _now = DateTime.now();

Question _q({
  String id = 'q1',
  bool mine = false,
  bool canAnswer = false,
  String? best,
  String? myAnswer,
  bool anonymous = false,
  bool closed = false,
  bool enough = false,
  List<QaAnswer> answers = const [],
}) => Question(
  id: id,
  title: 'Can my landlord keep the deposit after I moved out?',
  body: 'I left the flat clean and gave notice two months ahead.',
  isAnonymous: anonymous,
  isMine: mine,
  answerCount: answers.length,
  canAnswer: canAnswer,
  createdAt: _now,
  practiceArea: const QaPracticeArea(
    id: 'a1',
    i18nKey: 'qa.entry.hint',
    nameEn: 'Real estate',
  ),
  stateCode: 'NY',
  author: anonymous ? null : const QaPerson(id: 'u1', displayName: 'Anna K.'),
  bestAnswerId: best,
  myAnswerId: myAnswer,
  closed: closed,
  answersEnough: enough,
  answers: answers,
);

QaAnswer _a({bool best = false, bool mine = false, int likes = 2}) => QaAnswer(
  id: 'a1',
  questionId: 'q1',
  attorney: const QaPerson(
    id: 'l1',
    displayName: 'Jordan Lee',
    username: 'jlee',
  ),
  body: 'Yes, within 14 days with an itemised list.',
  likeCount: likes,
  likedByMe: false,
  isBest: best,
  isMine: mine,
  createdAt: _now,
);

class _Repo extends LegalQaRepository {
  _Repo({this.items = const [], this.detailQuestion}) : super(Dio());

  final List<Question> items;
  Question? detailQuestion;
  final queries = <QuestionsQuery>[];
  final asked = <String>[];
  final answered = <String>[];
  final best = <String?>[];
  final closedIds = <String>[];
  final liked = <String>[];

  @override
  Future<CursorPage<Question>> list(
    QuestionsQuery query, {
    String? cursor,
  }) async {
    queries.add(query);
    return CursorPage(items: items);
  }

  @override
  Future<Question> detail(String id) async => detailQuestion!;

  @override
  Future<Question> ask({
    required String title,
    required String body,
    String? practiceAreaId,
    String? stateCode,
    bool anonymous = false,
  }) async {
    asked.add(title);
    return _q();
  }

  @override
  Future<QaAnswer> answer(String id, String body) async {
    answered.add(body);
    return _a(mine: true);
  }

  @override
  Future<void> setBest(String id, String? answerId) async => best.add(answerId);

  @override
  Future<void> close(String id) async {
    closedIds.add(id);
    detailQuestion = _q(mine: true, closed: true);
  }

  @override
  Future<QaAnswer> like(String id, String answerId, {required bool on}) async {
    liked.add(answerId);
    return _a();
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  late List<Override> base;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      referralOffOverride,
      promotionsOffOverride,
    ];
  });

  Future<void> pump(
    WidgetTester tester,
    Widget child,
    _Repo repo, {
    bool attorney = false,
    TextDirection dir = TextDirection.ltr,
    Translator translator = const StaticTranslatorRu(),
    double textScale = 1.0,
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Directionality(textDirection: dir, child: child),
        theme: AppTheme.light(),
        size: narrowPhone,
        textScale: textScale,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: translator,
          extra: [
            ...base,
            legalQaRepositoryProvider.overrideWithValue(repo),
            actsAsAttorneyProvider.overrideWithValue(attorney),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
  }

  testWidgets('feed lists questions with tags and the best-answer badge', (
    tester,
  ) async {
    final best = _q(best: 'a1', answers: [_a(best: true)]);
    final repo = _Repo(items: [best]);
    await pump(tester, const QaFeedScreen(), repo);
    // The header carries the four tabs, in the owner's order.
    for (final tab in ['Все', 'Мои', 'Лучшие', 'Без ответа']) {
      expect(find.text(tab), findsWidgets);
    }
    expect(find.textContaining('Can my landlord'), findsOneWidget);
    expect(find.text('NY'), findsOneWidget);
    // Owner 2026-10-20: icon + number only in the card.
    expect(find.byType(QaBestBadge), findsOneWidget);
    expect(find.text('1'), findsOneWidget);
    // A client can ask; the first query is «all».
    expect(find.text('Задать вопрос'), findsOneWidget);
    expect(repo.queries.first.filter, QaFilter.all);
    expect(tester.takeException(), isNull);
  });

  testWidgets('an attorney has no «Ask» button; «All» stays in the practice', (
    tester,
  ) async {
    final repo = _Repo();
    await pump(tester, const QaFeedScreen(), repo, attorney: true);
    expect(find.text('Задать вопрос'), findsNothing);
    expect(find.text('Вопросов нет'), findsOneWidget);
    expect(repo.queries.first.mineScope, isTrue);
    // «Mine» = the questions I answered: no practice narrowing.
    await tester.tap(find.text('Мои'));
    await tester.pumpAndSettle();
    expect(repo.queries.last.filter, QaFilter.mine);
    expect(repo.queries.last.mineScope, isFalse);
  });

  testWidgets('tabs re-query with their filter and keep search and topic', (
    tester,
  ) async {
    final repo = _Repo();
    await pump(tester, const QaFeedScreen(), repo);
    // Owner 2026-10-21: the status filters are tabs, not filter chips.
    await tester.tap(find.byKey(const ValueKey('qa-filter-button')));
    await tester.pumpAndSettle();
    expect(find.text('Без ответа'), findsWidgets);
    expect(find.text('Лучшие'), findsWidgets);
    await tester.tap(find.text('Показать результаты'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText), 'deposit');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Без ответа'));
    await tester.pumpAndSettle();
    expect(repo.queries.last.filter, QaFilter.unanswered);
    expect(repo.queries.last.q, 'deposit');
    await tester.tap(find.text('Лучшие'));
    await tester.pumpAndSettle();
    expect(repo.queries.last.filter, QaFilter.solved);
    expect(repo.queries.last.q, 'deposit');
  });

  // Owner 2026-10-21: the four tabs fit the header at 360 dp.
  for (final (name, t, dir) in [
    ('ru', const StaticTranslatorRu() as Translator, TextDirection.ltr),
    ('longest', LongestTranslator(), TextDirection.ltr),
    ('longest rtl', LongestTranslator(), TextDirection.rtl),
    ('ne', ShippedTranslator('ne'), TextDirection.ltr),
    ('ar', ShippedTranslator('ar'), TextDirection.rtl),
    ('de', ShippedTranslator('de'), TextDirection.ltr),
    ('mr', ShippedTranslator('mr'), TextDirection.ltr),
  ]) {
    for (final attorney in [false, true]) {
      testWidgets('tabs and card fit at 360 dp ($name, '
          '${attorney ? 'attorney' : 'client'})', (tester) async {
        final full = _q(best: 'a1', answers: [_a(best: true)]);
        await pump(
          tester,
          const QaFeedScreen(),
          _Repo(items: [full]),
          attorney: attorney,
          dir: dir,
          translator: t,
          textScale: 1.1,
        );
        expect(tester.takeException(), isNull);
        final bar = tester.getRect(find.byKey(const ValueKey('qa-tabs')));
        expect(bar.width, lessThanOrEqualTo(300));
        expect(bar.right, lessThanOrEqualTo(360));
        expect(bar.left, greaterThanOrEqualTo(0));
        // No tab label is cut: a long one shrinks instead.
        final labels = tester.renderObjectList<RenderParagraph>(
          find.descendant(
            of: find.byKey(const ValueKey('qa-tabs')),
            matching: find.byType(RichText),
          ),
        );
        expect(labels, hasLength(4));
        for (final label in labels) {
          expect(label.didExceedMaxLines, isFalse);
        }
      });
    }
  }

  testWidgets('ask: «Send» stays off until topic, title and text are set', (
    tester,
  ) async {
    final repo = _Repo();
    await pump(tester, const AskQuestionScreen(), repo);
    final send = find.widgetWithText(AppButton, 'Отправить');
    expect(tester.widget<AppButton>(send).isEnabled, isFalse);
    await tester.enterText(
      find.byType(TextField).first,
      'Can my landlord keep it?',
    );
    await tester.enterText(
      find.byType(TextField).at(1),
      'I left the flat clean and gave notice.',
    );
    await tester.pump();
    // Still no topic.
    expect(tester.widget<AppButton>(send).isEnabled, isFalse);
  });

  testWidgets('ask renders in RTL at 360dp without overflow', (tester) async {
    await pump(
      tester,
      const AskQuestionScreen(initialState: 'NY'),
      _Repo(),
      dir: TextDirection.rtl,
    );
    expect(find.text('Скрыть моё имя'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('detail: the asker can mark the best answer', (tester) async {
    final repo = _Repo(detailQuestion: _q(mine: true, answers: [_a()]));
    await pump(tester, const QuestionDetailScreen(id: 'q1'), repo);
    expect(find.text('Jordan Lee'), findsOneWidget);
    expect(find.text('Лучший'), findsOneWidget);
    expect(find.text('Пожаловаться'), findsWidgets);
    await tester.tap(find.text('Лучший'));
    await tester.pump();
    expect(repo.best, ['a1']);
  });

  // Owner 2026-10-21: «Решён» sits on the «Ответы» row, at the end.
  for (final dir in TextDirection.values) {
    testWidgets('detail: «Решён» on the answers row (${dir.name})', (
      tester,
    ) async {
      final repo = _Repo(
        detailQuestion: _q(best: 'a1', answers: [_a(best: true)]),
      );
      await pump(
        tester,
        const QuestionDetailScreen(id: 'q1'),
        repo,
        dir: dir,
        textScale: 1.1,
      );
      expect(tester.takeException(), isNull);
      final title = tester.getRect(find.text('Ответы'));
      final solved = tester.getRect(find.text('Решён'));
      expect(solved.center.dy, closeTo(title.center.dy, 4));
      // At the far end of the row.
      final badge = tester.getRect(
        find.ancestor(
          of: find.text('Решён'),
          matching: find.byType(QaBestBadge),
        ),
      );
      if (dir == TextDirection.ltr) {
        expect(solved.left, greaterThan(title.right));
        expect(badge.right, closeTo(360 - AppSpacing.screenSide, 1));
      } else {
        expect(solved.right, lessThan(title.left));
        expect(badge.left, closeTo(AppSpacing.screenSide, 1));
      }
    });
  }

  testWidgets('detail: a verified attorney sees the answer box', (
    tester,
  ) async {
    final repo = _Repo(detailQuestion: _q(canAnswer: true));
    await pump(
      tester,
      const QuestionDetailScreen(id: 'q1'),
      repo,
      attorney: true,
    );
    expect(find.text('Ваш ответ'), findsOneWidget);
    expect(find.text('Пока нет ответов'), findsOneWidget);
  });

  testWidgets('detail: an anonymous question shows «Аноним»', (tester) async {
    await pump(
      tester,
      const QuestionDetailScreen(id: 'q1'),
      _Repo(detailQuestion: _q(anonymous: true)),
    );
    expect(find.text('Аноним'), findsOneWidget);
    expect(find.text('Anna K.'), findsNothing);
  });

  // Owner 2026-10-21: a tap on a question lifts the answers sheet.
  testWidgets('a tap on a question opens the sheet; a client likes', (
    tester,
  ) async {
    final repo = _Repo(
      items: [_q()],
      detailQuestion: _q(answers: [_a()]),
    );
    await pump(tester, const QaFeedScreen(), repo);
    await tester.tap(find.textContaining('Can my landlord'));
    await tester.pumpAndSettle();
    expect(find.byType(QuestionDetailScreen), findsOneWidget);
    expect(find.text('Jordan Lee'), findsOneWidget);
    await tester.tap(find.bySemanticsLabel('Полезно'));
    await tester.pump();
    expect(repo.liked, ['a1']);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the author closes the question; it shows «Закрыт»', (
    tester,
  ) async {
    final repo = _Repo(detailQuestion: _q(mine: true));
    await pump(tester, const QuestionDetailScreen(id: 'q1'), repo);
    expect(find.text('Закрыт'), findsNothing);
    await tester.tap(find.bySemanticsLabel('Ещё'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Закрыть вопрос'));
    await tester.pumpAndSettle();
    expect(find.text('Закрыть вопрос?'), findsOneWidget);
    await tester.tap(find.text('Закрыть вопрос').last);
    await tester.pumpAndSettle();
    expect(repo.closedIds, ['q1']);
    expect(find.text('Закрыт'), findsOneWidget);
    // A closed question has nothing more to close.
    await tester.tap(find.bySemanticsLabel('Ещё'));
    await tester.pumpAndSettle();
    expect(find.text('Закрыть вопрос'), findsNothing);
  });

  testWidgets('an attorney sees why the answer box is gone', (tester) async {
    await pump(
      tester,
      const QuestionDetailScreen(id: 'q1'),
      _Repo(detailQuestion: _q(enough: true)),
      attorney: true,
    );
    expect(find.text('Ответов достаточно'), findsOneWidget);
    expect(find.text('Ваш ответ'), findsNothing);
  });

  testWidgets('an attorney sees no like button on answers', (tester) async {
    await pump(
      tester,
      const QuestionDetailScreen(id: 'q1'),
      _Repo(
        detailQuestion: _q(myAnswer: 'a1', answers: [_a(mine: true)]),
      ),
      attorney: true,
    );
    expect(find.text('Jordan Lee'), findsOneWidget);
    expect(find.bySemanticsLabel('Полезно'), findsNothing);
  });

  testWidgets('an attorney on a closed question sees «Закрыт»', (tester) async {
    await pump(
      tester,
      const QuestionDetailScreen(id: 'q1'),
      _Repo(detailQuestion: _q(closed: true)),
      attorney: true,
    );
    // The tag and the note under the answers.
    expect(find.text('Закрыт'), findsNWidgets(2));
  });

  group('notification routing', () {
    test('a new question and an answer open the question', () {
      for (final type in ['legal_question_new', 'legal_answer_update']) {
        expect(
          notificationRoute(
            type: type,
            payload: {'questionId': 'q9'},
            attorney: false,
          ),
          LegalQaRoutes.question('q9'),
        );
      }
      expect(
        notificationRoute(
          type: 'legal_answer_update',
          payload: const {},
          attorney: false,
        ),
        isNull,
      );
    });
  });
}
