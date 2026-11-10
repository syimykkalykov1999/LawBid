import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_feed_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';

/// App audit 2026-10-26 A6: the Q&A list stopped for good after a failed
/// next page — no Retry, no new attempt on scroll. Now the list ends in the
/// shared pagination error row with Retry, and the next scroll down tries
/// again on its own (Instagram / Telegram).
Question _q(String id) => Question(
      id: id,
      title: 'Question $id about a deposit the landlord keeps',
      body: 'I left the flat clean and gave notice two months ahead.',
      isAnonymous: false,
      isMine: false,
      answerCount: 0,
      canAnswer: true,
      createdAt: DateTime.now(),
      practiceArea: const QaPracticeArea(
        id: 'a1',
        i18nKey: 'qa.entry.hint',
        nameEn: 'Real estate',
      ),
      stateCode: 'NY',
      author: const QaPerson(id: 'u2', displayName: 'Anna K.'),
    );

class _Repo extends LegalQaRepository {
  _Repo() : super(Dio());

  /// How many next-page reads fail before one works.
  int failures = 1;
  int nextReads = 0;

  @override
  Future<CursorPage<Question>> list(
    QuestionsQuery query, {
    String? cursor,
  }) async {
    if (cursor == null) {
      return CursorPage(
        items: [for (var i = 0; i < 12; i++) _q('q$i')],
        nextCursor: 'c2',
      );
    }
    nextReads++;
    if (nextReads <= failures) {
      throw const ApiException(
        code: 'NETWORK_ERROR',
        message: 'offline',
        statusCode: 0,
      );
    }
    return CursorPage(items: [_q('last')]);
  }
}

void main() {
  setUpAll(initializeDateFormatting);

  Future<_Repo> pump(WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final repo = _Repo();
    await tester.pumpWidget(
      uxApp(
        const Scaffold(body: QaFeedBody(embedded: true)),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            referralOffOverride,
            promotionsOffOverride,
            legalQaRepositoryProvider.overrideWithValue(repo),
            actsAsAttorneyProvider.overrideWithValue(true),
            qaNotifySwitchProvider
                .overrideWithValue(() => const SizedBox.shrink()),
            currentUserIdProvider.overrideWithValue('u1'),
            currentUserRoleProvider.overrideWithValue(UserRole.attorney),
            realtimeEventsProvider
                .overrideWithValue(const Stream<RealtimeEvent>.empty()),
          ],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    return repo;
  }

  /// Scrolls down until the list asked for its next page once more (or, with
  /// [all], to the very end).
  Future<void> toEnd(
    WidgetTester tester,
    _Repo repo, {
    bool all = false,
  }) async {
    final before = repo.nextReads;
    for (var i = 0; i < 6 && (all || repo.nextReads == before); i++) {
      await tester.drag(find.byType(ListView).last, const Offset(0, -1500));
      await tester.pump(const Duration(milliseconds: 300));
    }
  }

  testWidgets('a failed next page ends in Retry; Retry loads it',
      (tester) async {
    final repo = await pump(tester);
    await toEnd(tester, repo);
    expect(repo.nextReads, 1);
    expect(find.text('Retry'), findsOneWidget);

    await tester.tap(find.text('Retry'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(repo.nextReads, 2);
    expect(find.text('Retry'), findsNothing);
    await toEnd(tester, repo, all: true);
    expect(find.textContaining('Question last'), findsOneWidget);
  });

  testWidgets('after a failed next page a new scroll down tries again',
      (tester) async {
    final repo = await pump(tester);
    await toEnd(tester, repo);
    expect(repo.nextReads, 1);

    await tester.drag(find.byType(ListView).last, const Offset(0, -300));
    await tester.pump(const Duration(milliseconds: 300));
    expect(repo.nextReads, 2);
    await toEnd(tester, repo, all: true);
    expect(find.textContaining('Question last'), findsOneWidget);
  });
}
