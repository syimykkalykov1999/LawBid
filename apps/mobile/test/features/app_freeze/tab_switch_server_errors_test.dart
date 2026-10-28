import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/network/legacy_shape_interceptor.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_tabs_bar.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/presentation/task_board_widgets.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/ux_harness.dart';
import '../cases/cases_fakes.dart';
import '../groups/fake_group_repository.dart';
import '../profile/profile_fakes.dart';
import '../team/team_fakes.dart';

/// Owner 2026-10-28: the app froze on a tab / segment switch against an
/// older server (404s, 400s, answers missing new fields). Whatever the
/// server answers, switching sections must stay responsive: every
/// transition settles, nothing throws, error states show instead.

const _notFound = ApiException(
  code: 'NOT_FOUND',
  message: 'Cannot GET',
  statusCode: 404,
);

/// Every cases list answers 404 (a route the older server lacks).
class _FailingCases extends FakeCasesRepository {
  Future<Never> _fail() => Future<Never>.error(_notFound);

  @override
  Future<CursorPage<CaseSummary>> myCases(
    MyCasesFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) =>
      _fail();

  @override
  Future<CursorPage<FeedCase>> feed({
    String? cursor,
    String? practiceAreaId,
    String? practiceCategory,
    String? state,
    CaseFeedExtras extras = const CaseFeedExtras(),
    bool mineOnly = true,
    List<String> states = const [],
  }) =>
      _fail();

  @override
  Future<CursorPage<MyBid>> myBids(
    MyBidsFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) =>
      _fail();

  @override
  Future<CursorPage<WorkItem>> myWork(
    WorkFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) =>
      _fail();

  @override
  Future<CursorPage<SavedCase>> savedCases({
    String? cursor,
    MineSearch search = const MineSearch(),
  }) =>
      _fail();
}

/// Every chat call answers 500.
class _FailingChats implements ChatRepository {
  @override
  dynamic noSuchMethod(Invocation invocation) => Future<Never>.error(
        const ApiException(
          code: 'INTERNAL_ERROR',
          message: 'boom',
          statusCode: 500,
        ),
      );
}

/// A real Dio (with the app's legacy-shape fix) whose every answer is a
/// 404 or a 500 — for the repositories built on [dioProvider].
Dio _erroringDio() {
  var n = 0;
  final dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
    ..interceptors.add(LegacyShapeInterceptor())
    ..httpClientAdapter = FakeHttpAdapter(
      (_) async => (n++).isEven
          ? apiError(404, 'NOT_FOUND')
          : apiError(500, 'INTERNAL_ERROR'),
    );
  return dio;
}

/// The overrides beside the fakes' own: every other repository on a Dio
/// that only errors. (The attorney's own profile: [FakeAttorneyRepo] with
/// no profile throws — an unreadable answer.)
List<Override> _erroringServer() => [
      dioProvider.overrideWithValue(_erroringDio()),
      chatRepositoryProvider.overrideWithValue(_FailingChats()),
      realtimeClientProvider.overrideWithValue(null),
    ];

Future<void> _swipe(WidgetTester tester, double dx, {double y = 560}) async {
  await tester.flingFrom(Offset(dx < 0 ? 300 : 90, y), Offset(dx, 0), 1500);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets(
      'feed: Posts → Reels → Cases → Chats and back, with every call failing, '
      'settles each time (no freeze, no exception)', (tester) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        const FeedScreen(),
        theme: AppTheme.light(),
        overrides: uxOverrides(
          cases: _FailingCases(),
          extra: [
            attorneyProfileRepositoryProvider
                .overrideWithValue(FakeAttorneyRepo()),
            practiceTreeProvider.overrideWith((ref) async => const []),
            groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
            teamRepositoryProvider.overrideWithValue(FakeTeamRepository()),
            currentUserIdProvider.overrideWithValue('me'),
            currentUserRoleProvider.overrideWithValue(UserRole.attorney),
            ..._erroringServer(),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    final chats = find.byType(InboxScreen);
    // Forth by swipes, back by swipes, then by the header's tabs, twice.
    for (var round = 0; round < 2; round++) {
      await _swipe(tester, -300); // Posts → Reels
      await _swipe(tester, -300); // Reels → Cases
      expect(tester.takeException(), isNull);
      await _swipe(tester, -300); // Cases → Chats
      expect(chats, findsOneWidget);
      // Chats has its own pages first; back past them to the feed.
      for (var i = 0; i < 4; i++) {
        await _swipe(tester, 300);
      }
      expect(chats, findsNothing);
      for (final key in ['pill-_FeedTab.cases', 'pill-_FeedTab.posts']) {
        await tester.tap(find.byKey(ValueKey(key)).first);
        await tester.pumpAndSettle();
      }
    }
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 5));
  });

  group('Cases screen sections (attorney)', () {
    Future<void> pump(WidgetTester tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 844);
      addTearDown(tester.view.reset);
      final wrap = await profileWrapper(
        AppTheme.light(),
        user: attorneyMe(),
        overrides: [
          ...profileOverrides(cases: _FailingCases()),
          teamRepositoryProvider.overrideWithValue(FakeTeamRepository()),
          legalQaEnabledProvider.overrideWithValue(true),
          ..._erroringServer(),
        ],
      );
      await tester.pumpWidget(wrap(const MineScreen()));
      await tester.pumpAndSettle();
    }

    Future<void> done(WidgetTester tester) async {
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 5));
    }

    bool chipOn(WidgetTester tester, String key) => tester
        .widget<MiniChip>(find.byKey(ValueKey('tasks-view-$key')))
        .selected;

    QaTab qaTab(WidgetTester tester) =>
        tester.widget<QaTabsBar>(find.byType(QaTabsBar)).value;

    final tasksOnScreen = find.byKey(const ValueKey('tasks-view-all'));
    final qaOnScreen = find.byType(QaTabsBar);

    testWidgets(
        'switching Cases / Tasks / Questions with every call failing '
        'settles (no freeze, no exception)', (tester) async {
      await pump(tester);
      for (var round = 0; round < 3; round++) {
        for (final tab in ['planner', 'qa', 'cases', 'qa', 'planner']) {
          await tester.tap(find.byKey(ValueKey('pill-_AttorneyTab.$tab')));
          await tester.pumpAndSettle();
        }
      }
      expect(tester.takeException(), isNull);
      await done(tester);
    });

    testWidgets(
        '«Tasks»: a swipe moves through its chips first, and only past the '
        'last one on to «Questions» (and back)', (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const ValueKey('pill-_AttorneyTab.planner')));
      await tester.pumpAndSettle();
      expect(chipOn(tester, 'all'), isTrue);

      await _swipe(tester, -300);
      expect(tasksOnScreen, findsOneWidget);
      expect(chipOn(tester, 'overdue'), isTrue);
      expect(chipOn(tester, 'all'), isFalse);

      // all · overdue · for client · joint · assistant · done.
      for (var i = 0; i < 4; i++) {
        await _swipe(tester, -300);
      }
      expect(tasksOnScreen, findsOneWidget);
      expect(chipOn(tester, 'done'), isTrue);

      // Past the last chip: the next section.
      await _swipe(tester, -300);
      expect(qaOnScreen, findsOneWidget);
      expect(qaTab(tester), QaTab.all);

      // Back: from Questions' first section to Tasks' last chip, then on
      // through the chips backwards.
      await _swipe(tester, 300);
      expect(tasksOnScreen, findsOneWidget);
      expect(chipOn(tester, 'done'), isTrue);
      await _swipe(tester, 300);
      expect(tasksOnScreen, findsOneWidget);
      expect(chipOn(tester, 'assistant'), isTrue);
      expect(tester.takeException(), isNull);
      await done(tester);
    });

    testWidgets(
        '«Questions»: a swipe moves through its sections first, and only '
        'before the first one back to «Tasks»', (tester) async {
      await pump(tester);
      await tester.tap(find.byKey(const ValueKey('pill-_AttorneyTab.qa')));
      await tester.pumpAndSettle();
      expect(qaTab(tester), QaTab.all);

      await _swipe(tester, -300);
      expect(qaOnScreen, findsOneWidget);
      expect(qaTab(tester), QaTab.mine);
      await _swipe(tester, -300);
      await _swipe(tester, -300);
      expect(qaTab(tester), QaTab.values.last);
      // The last section of the last tab: it stays.
      await _swipe(tester, -300);
      expect(qaOnScreen, findsOneWidget);
      expect(qaTab(tester), QaTab.values.last);

      // Back through the sections, then past the first one to Tasks.
      for (var i = 0; i < QaTab.values.length - 1; i++) {
        await _swipe(tester, 300);
      }
      expect(qaOnScreen, findsOneWidget);
      expect(qaTab(tester), QaTab.all);
      await _swipe(tester, 300);
      expect(tasksOnScreen, findsOneWidget);
      expect(tester.takeException(), isNull);
      await done(tester);
    });
  });
}
