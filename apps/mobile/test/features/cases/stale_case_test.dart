import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/data/cases_mappers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/screens/mine_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_stale_banner.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/onboarding_harness.dart';
import '../../helpers/ux_harness.dart';
import '../profile/profile_fakes.dart';
import 'cases_fakes.dart';

/// Owner 2026-10-17/18 (OQ-054): «Вам ещё нужен адвокат?», the pause, and
/// the attorney card's activity line.
/// A static translator that returns the key for the server-only ones.
class _Safe implements Translator {
  const _Safe(this.inner);
  final Translator inner;

  @override
  String t(String key, [Map<String, String>? params]) {
    try {
      return inner.t(key, params);
      // ignore: avoid_catching_errors
    } on AssertionError {
      return key;
    }
  }

  @override
  String plural(String key, num count, [Map<String, String>? params]) =>
      inner.plural(key, count, params);
}

const _quote = PromotionQuote(
  days: 3,
  priceCentsPerDay: 500,
  grossCents: 1500,
  totalCents: 1500,
  creditDaysAvailable: 0,
  creditDaysUsed: 0,
  maxDays: 30,
  enabled: true,
);

void main() {
  setUpAll(initializeDateFormatting);

  const practice = PracticeRef(
    id: 'p1',
    code: 'general_practice.not_sure_or_other',
    i18nKey: 'practice.general_practice.not_sure_or_other',
    nameEn: 'Not sure',
  );

  CaseSummary summary({
    DateTime? pausedAt,
    bool pending = false,
    bool notUrgent = false,
  }) =>
      CaseSummary(
        id: 'c1',
        title: 'Speeding ticket in Trenton',
        practice: practice,
        primaryStateCode: 'NJ',
        additionalStateCount: 0,
        city: null,
        status: CaseStatus.open,
        budget: const CaseBudget(mode: BudgetMode.clarifyLater),
        bidsCount: 0,
        createdAt: DateTime(2026, 10),
        lastActivityAt: DateTime(2026, 10),
        pausedAt: pausedAt,
        stillNeededPending: pending,
        canMakeNotUrgent: notUrgent,
      );

  Future<FakeCasesRepository> pumpBanner(
    WidgetTester tester, {
    required bool paused,
    required bool pending,
    bool notUrgent = false,
    ThemeData? theme,
    DateTime? hidesAt,
    DateTime? archivesAt,
  }) async {
    final repo = FakeCasesRepository();
    final wrap = await onboardingWrapper(
      theme ?? AppTheme.light(),
      user: clientMe(),
      extra: casesOverrides(repo: repo),
    );
    await tester.pumpWidget(
      wrap(
        Scaffold(
          body: SingleChildScrollView(
            child: CaseStaleBanner(
              caseId: 'c1',
              paused: paused,
              pending: pending,
              canMakeNotUrgent: notUrgent,
              hidesAt: hidesAt,
              archivesAt: archivesAt,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('the question says why it appeared and the date it acts',
      (tester) async {
    await pumpBanner(
      tester,
      paused: false,
      pending: true,
      hidesAt: DateTime(2026, 10, 21, 15),
    );
    expect(
      find.textContaining('If you do not answer by Oct 21'),
      findsOneWidget,
    );
    expect(find.textContaining('keep the case in the feed'), findsOneWidget);
  });

  testWidgets('a paused case says when it moves to the archive',
      (tester) async {
    await pumpBanner(
      tester,
      paused: true,
      pending: false,
      archivesAt: DateTime(2026, 11, 17, 15),
    );
    expect(
      find.textContaining('by Nov 17, it moves to the archive'),
      findsOneWidget,
    );
  });

  testWidgets('the question offers three answers; each one is sent',
      (tester) async {
    final repo = await pumpBanner(tester, paused: false, pending: true);
    expect(
      find.text(
        'You have not opened this case in a while. Is it still current?',
      ),
      findsOneWidget,
    );
    expect(find.text('Yes, still needed'), findsOneWidget);
    expect(find.text('Waiting for better offers'), findsOneWidget);
    expect(find.text('No longer needed'), findsOneWidget);
    // «Не срочно» only when the case is urgent and older than a week.
    expect(find.byKey(const ValueKey('stale-not-urgent')), findsNothing);

    await tester.tap(find.byKey(const ValueKey('stale-yes')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('stale-wait')));
    await tester.pumpAndSettle();
    expect(repo.calls, ['answer:stillNeeded', 'answer:waitBetter']);
  });

  testWidgets('«Уже не нужен» asks first, then closes through the answer',
      (tester) async {
    final repo = await pumpBanner(tester, paused: false, pending: true);
    await tester.tap(find.byKey(const ValueKey('stale-no')));
    await tester.pumpAndSettle();
    expect(repo.calls, isEmpty);
    // The confirm sheet: the same «Close the case?» as everywhere.
    expect(find.text('Close the case?'), findsWidgets);
    await tester.tap(find.widgetWithText(AppButton, 'Close case').last);
    await tester.pumpAndSettle();
    expect(repo.calls, ['answer:notNeeded']);
  });

  testWidgets('«Сменить на «Не срочно»» appears only when it is offered',
      (tester) async {
    final repo = await pumpBanner(
      tester,
      paused: false,
      pending: true,
      notUrgent: true,
    );
    final button = find.byKey(const ValueKey('stale-not-urgent'));
    expect(button, findsOneWidget);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(repo.calls, ['answer:makeNotUrgent']);
  });

  testWidgets('a paused case says so and has one «Вернуть» button',
      (tester) async {
    final repo = await pumpBanner(tester, paused: true, pending: false);
    expect(
      find.text(
        'Case hidden from the attorneys’ feed — no answer for a while',
      ),
      findsOneWidget,
    );
    expect(find.text('Yes, still needed'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('stale-resume')));
    await tester.pumpAndSettle();
    expect(repo.calls, ['resume']);
  });

  testWidgets('the banner follows every theme without raw gold fills',
      (tester) async {
    for (final id in AppThemeId.values) {
      final theme = AppTheme.of(id);
      await pumpBanner(
        tester,
        paused: false,
        pending: true,
        notUrgent: true,
        theme: theme,
      );
      final colors = theme.extension<AppColorTokens>()!;
      final boxes = tester
          .widgetList<Container>(find.byType(Container))
          .map((c) => c.decoration)
          .whereType<BoxDecoration>()
          .map((d) => d.color)
          .whereType<Color>();
      expect(boxes, isNot(contains(colors.goldTint)));
      expect(boxes, isNot(contains(colors.gold)));
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('My cases: a paused case reads «Paused»; the question is a card',
      (tester) async {
    final repo = FakeCasesRepository(
      myCasesItems: [
        summary(pausedAt: DateTime(2026, 10, 10)),
      ],
    );
    final wrap = await onboardingWrapper(
      AppTheme.light(),
      user: clientMe(),
      extra: [
        ...casesOverrides(repo: repo),
        casePromotionProvider.overrideWith(
          (ref, id) async =>
              const CasePromotionState(canPromote: false, quote: _quote),
        ),
      ],
    );
    await tester.pumpWidget(wrap(const Scaffold(body: ClientMineView())));
    await tester.pumpAndSettle();
    expect(find.text('Paused'), findsOneWidget);
    expect(find.byKey(const ValueKey('stale-paused')), findsOneWidget);
  });

  testWidgets('My cases: a pending question shows its answers', (tester) async {
    final repo = FakeCasesRepository(
      myCasesItems: [summary(pending: true)],
    );
    final wrap = await onboardingWrapper(
      AppTheme.dark(),
      user: clientMe(),
      extra: [
        ...casesOverrides(repo: repo),
        casePromotionProvider.overrideWith(
          (ref, id) async =>
              const CasePromotionState(canPromote: false, quote: _quote),
        ),
      ],
    );
    await tester.pumpWidget(wrap(const Scaffold(body: ClientMineView())));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('stale-prompt')), findsOneWidget);
    expect(find.text('Yes, still needed'), findsOneWidget);
  });

  group('the attorney card line', () {
    FeedCase feedCase({ClientActivity? activity}) => FeedCase(
          id: 'f1',
          title: 'Speeding ticket',
          practice: practice,
          primaryStateCode: 'CA',
          additionalStateCodes: const [],
          city: null,
          status: CaseStatus.open,
          budget: const CaseBudget(mode: BudgetMode.clarifyLater),
          viewCount: 1,
          bidsCount: 0,
          createdAt: DateTime.now(),
          isNew: false,
          hasOwnBid: false,
          clientActivity: activity,
        );

    Future<void> pumpCard(WidgetTester tester, FeedCase item) async {
      tester.view.physicalSize = const Size(360, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      const translator = _Safe(StaticTranslatorEn());
      await tester.pumpWidget(
        uxApp(
          Scaffold(
            body: SingleChildScrollView(
              child: FeedCaseCard(
                item: item,
                t: translator,
                formats: L10nFormats(AppLanguage.fallback),
                onTap: () {},
              ),
            ),
          ),
          theme: AppTheme.light(),
          size: const Size(360, 740),
          overrides: uxOverrides(translator: translator),
        ),
      );
      await tester.pump();
    }

    testWidgets('shows the line from the API data', (tester) async {
      await pumpCard(
        tester,
        feedCase(
          activity:
              const ClientActivity(lastSeenDays: 2, respondsWithinDay: true),
        ),
      );
      expect(find.byType(ClientActivityLine), findsOneWidget);
      expect(find.textContaining('Client active 2 days ago'), findsOneWidget);
      expect(
        find.textContaining('Usually replies within a day'),
        findsOneWidget,
      );
    });

    testWidgets('no line when the client hides their activity', (tester) async {
      await pumpCard(tester, feedCase());
      expect(find.byType(ClientActivityLine), findsNothing);
    });

    test('the mapper keeps null as null and copies the fields', () {
      expect(CasesMappers.clientActivity(null), isNull);
      final a = CasesMappers.clientActivity(
        const api.ClientActivityDto(
          online: false,
          respondsWithinDay: true,
          lastSeenDays: 3,
        ),
      )!;
      expect(a.online, isFalse);
      expect(a.lastSeenDays, 3);
      expect(a.respondsWithinDay, isTrue);
    });
  });

  test('the notification opens the case and counts the cases', () {
    const t = StaticTranslatorEn();
    String text(Object? count) => notificationText(
          t,
          AppNotification(
            id: 'n1',
            type: 'case_still_needed',
            category: NotifCategory.cases,
            payload: {'caseId': 'c1', 'count': count},
            aggregateCount: 1,
            createdAt: DateTime(2026, 10, 18),
          ),
        );
    expect(text(1), contains('You have not opened 1 case'));
    expect(text(2), contains('You have not opened 2 cases'));
  });
}
