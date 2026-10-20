import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
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
  List<QaAnswer> answers = const [],
}) =>
    Question(
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
      author:
          anonymous ? null : const QaPerson(id: 'u1', displayName: 'Anna K.'),
      bestAnswerId: best,
      myAnswerId: myAnswer,
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
  final Question? detailQuestion;
  final queries = <QuestionsQuery>[];
  final asked = <String>[];
  final answered = <String>[];
  final best = <String?>[];

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
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Directionality(textDirection: dir, child: child),
        theme: AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: const StaticTranslatorRu(),
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
    expect(find.text('Вопрос юристу'), findsOneWidget);
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

  testWidgets('an attorney has no «Ask» button and no «Mine» tab', (
    tester,
  ) async {
    await pump(tester, const QaFeedScreen(), _Repo(), attorney: true);
    expect(find.text('Задать вопрос'), findsNothing);
    expect(find.text('Мои'), findsNothing);
    expect(find.text('Вопросов нет'), findsOneWidget);
  });

  testWidgets('the unanswered tab re-queries with its filter', (tester) async {
    final repo = _Repo();
    await pump(tester, const QaFeedScreen(), repo);
    // The filters sit behind the button inside the search field.
    expect(find.text('Без ответа'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('qa-filter-button')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Без ответа'));
    await tester.pump();
    await tester.tap(find.text('Показать результаты'));
    await tester.pumpAndSettle();
    expect(repo.queries.last.filter, QaFilter.unanswered);
  });

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
    final repo = _Repo(
      detailQuestion: _q(mine: true, answers: [_a()]),
    );
    await pump(
      tester,
      const QuestionDetailScreen(id: 'q1'),
      repo,
    );
    expect(find.text('Jordan Lee'), findsOneWidget);
    expect(find.text('Лучший'), findsOneWidget);
    expect(find.text('Пожаловаться'), findsWidgets);
    await tester.tap(find.text('Лучший'));
    await tester.pump();
    expect(repo.best, ['a1']);
  });

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
