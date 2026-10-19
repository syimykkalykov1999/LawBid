import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/presentation/widgets/attorney_view_preview.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_stale_banner.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/guide/presentation/guide_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/data/promotions_repository.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/settings/archive/archive_screen.dart';
import 'package:lawbid/features/social/application/post_insights_providers.dart';
import 'package:lawbid/features/social/domain/post_insights_models.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:lawbid/features/social/presentation/screens/post_insights_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_promo_row.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/cases/cases_fakes.dart';
import '../features/profile/profile_fakes.dart';
import '../features/social/social_fakes.dart';
import '../helpers/long_locale.dart';
import '../helpers/onboarding_harness.dart' show FixedUserController;
import '../helpers/referral_overrides.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-18: the screens added today (post insights, the case
/// preview sheet, the «still needed?» banner, the archive and the own-post
/// menu, the post form, the promo row, the guide, the attorney profile's
/// icon tabs) on a 360 dp phone in the longest translation of every key,
/// the same right-to-left, and in Russian — at text scale 1 and at the
/// largest the app allows (1.1, lib/app.dart). Any overflow fails.
void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('no overflow at 360 dp ($name, text x$scale)', () {
        List<Override> overrides({
          FakeSocialRepository? social,
          FakeCasesRepository? cases,
          CurrentUser? user,
          List<Override> extra = const [],
        }) =>
            uxOverrides(
              translator: t,
              social: social,
              cases: cases,
              extra: [
                sharedPreferencesProvider.overrideWithValue(prefs),
                referralOffOverride,
                partnerOffOverride,
                if (user != null)
                  currentUserControllerProvider.overrideWith(
                    () => FixedUserController(CurrentUserState.ready(user)),
                  ),
                ...extra,
              ],
            );

        // Direction and text scale above the Navigator, so sheets and
        // pushed routes get them too.
        Widget frame(BuildContext context, Widget? child) => Directionality(
              textDirection: dir,
              child: MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(scale),
                  disableAnimations: true,
                ),
                child: child!,
              ),
            );

        Future<void> pump(
          WidgetTester tester,
          Widget home, {
          List<Override> overrides = const [],
          ThemeData? theme,
        }) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            ProviderScope(
              overrides: overrides,
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: theme ?? AppTheme.light(),
                builder: frame,
                home: home,
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
        }

        /// Scrolls the main vertical list to its end, checking each step.
        Future<void> scrollThrough(WidgetTester tester) async {
          final list = find.byWidgetPredicate(
            (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
          );
          for (var i = 0; i < 12; i++) {
            if (list.evaluate().isEmpty) return;
            await tester.drag(
              list.first,
              const Offset(0, -400),
              warnIfMissed: false,
            );
            await tester.pump(const Duration(milliseconds: 300));
            expect(tester.takeException(), isNull);
          }
        }

        // Lets list providers' keep-alive timers run out.
        Future<void> settle(WidgetTester tester) async {
          await tester.pumpWidget(const SizedBox());
          await tester.pump(const Duration(seconds: 30));
        }

        // 1. Post insights, plain and promoted (video: the Views row).
        for (final promoted in [false, true]) {
          testWidgets('post insights${promoted ? ' (promoted video)' : ''}',
              (tester) async {
            await pump(
              tester,
              PostInsightsScreen(
                postId: 'p1',
                post: _insightsPost(video: promoted),
              ),
              overrides: overrides(
                extra: [
                  postInsightsProvider('p1')
                      .overrideWith((_) async => _insights),
                  postPromotionProvider('p1').overrideWith(
                    (_) async => _promoState(promoted ? 'promo-1' : ''),
                  ),
                ],
              ),
            );
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('insights-chart')),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
            await tester
                .tap(find.byKey(const ValueKey('insights-metric-reach')));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            await scrollThrough(tester);
          });
        }

        // 2. «Как выглядит ваш кейс».
        testWidgets('case draft preview sheet', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () => showAttorneyViewPreview(
                    context,
                    item: AttorneyViewPreview.feedViewOfDraft(_draft, _files),
                    t: t,
                    formats: L10nFormats(AppLanguage.ru),
                  ),
                  child: const Text('open'),
                ),
              ),
            ),
            overrides: overrides(),
          );
          await tester.tap(find.text('open'));
          await tester.pumpAndSettle();
          expect(
            find.byKey(const ValueKey('case-preview-more')),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
        });

        // 3. «Вам ещё нужен адвокат?» and the paused case.
        for (final paused in [false, true]) {
          testWidgets('case stale banner (${paused ? 'paused' : 'question'})',
              (tester) async {
            await pump(
              tester,
              Scaffold(
                body: SingleChildScrollView(
                  child: CaseStaleBanner(
                    caseId: 'c1',
                    paused: paused,
                    pending: !paused,
                    canMakeNotUrgent: !paused,
                    hidesAt: paused ? null : DateTime(2026, 10, 21, 15),
                    archivesAt: paused ? DateTime(2026, 11, 17, 15) : null,
                  ),
                ),
              ),
              overrides: overrides(
                cases: FakeCasesRepository(),
                user: clientMe(),
              ),
            );
            await tester.pumpAndSettle();
            expect(
              find.byKey(
                ValueKey(paused ? 'stale-resume' : 'stale-not-urgent'),
              ),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
          });
        }

        // 4. Archive grid, an archived post, and the own-post ⋯ menu.
        testWidgets('archive screen and archived post', (tester) async {
          final at = DateTime(2026, 10, 18);
          final repo = _ArchiveRepo()
            ..archived = [
              _own('a2', archivedAt: at),
              _own('a1', archivedAt: at),
            ];
          await pump(
            tester,
            const ArchiveScreen(),
            overrides: overrides(social: repo),
          );
          await tester.pump(const Duration(seconds: 1));
          expect(find.byKey(const ValueKey('archive-tile-a2')), findsOneWidget);
          expect(tester.takeException(), isNull);
          await tester.tap(find.byKey(const ValueKey('archive-tile-a2')));
          await tester.pumpAndSettle();
          expect(
            find.byKey(const ValueKey('archive-post-note')),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
          await settle(tester);
        });

        testWidgets('archive screen empty', (tester) async {
          await pump(
            tester,
            const ArchiveScreen(),
            overrides: overrides(social: _ArchiveRepo()),
          );
          await tester.pump(const Duration(seconds: 1));
          expect(find.byKey(const ValueKey('archive-empty')), findsOneWidget);
          expect(tester.takeException(), isNull);
          await settle(tester);
        });

        for (final archived in [false, true]) {
          testWidgets(
              'own post menu (${archived ? 'archived, comments off' : 'live'})',
              (tester) async {
            final post = archived
                ? _own(
                    'p1',
                    commentsEnabled: false,
                    archivedAt: DateTime(2026, 10, 18),
                  )
                : _own('p1');
            await pump(
              tester,
              Scaffold(
                body: Consumer(
                  builder: (context, ref, _) => TextButton(
                    onPressed: () => showPostMenu(context, ref, post),
                    child: const Text('open'),
                  ),
                ),
              ),
              overrides: overrides(social: _ArchiveRepo()),
            );
            await tester.tap(find.text('open'));
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('post-menu-comments')),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
          });
        }

        // 5. The post form: title / description, counters, media tiles.
        for (final photos in [0, 2]) {
          testWidgets('create post ($photos photos)', (tester) async {
            await pump(
              tester,
              CreatePostScreen(debugPhotoCount: photos),
              overrides: overrides(),
            );
            expect(
              find.byKey(const ValueKey('post-title-field')),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
            await tester.enterText(
              find.byKey(const ValueKey('post-title-field')),
              'Tenant rights in five points, explained',
            );
            await tester.enterText(
              find.byKey(const ValueKey('post-body-field')),
              'Text ' * 40,
            );
            await tester.pump();
            expect(tester.takeException(), isNull);
            await scrollThrough(tester);
          });
        }

        // 6. «Stats» | «Boost this post» under an own post.
        final promoCases = <String, (CasePromotion?, bool)>{
          'never promoted': (null, true),
          'running': (_promo(PromotionStatus.active), false),
          'finished': (_promo(PromotionStatus.finished), true),
        };
        for (final MapEntry(key: label, value: (promo, canPromote))
            in promoCases.entries) {
          testWidgets('post promo row ($label)', (tester) async {
            useNarrowPhone(tester);
            final router = GoRouter(
              routes: [
                GoRoute(
                  path: '/',
                  builder: (_, __) => Scaffold(
                    body: PostPromoRow(
                      post: fakePost('p1', withPhoto: true, mine: true),
                    ),
                  ),
                ),
              ],
            );
            await tester.pumpWidget(
              ProviderScope(
                overrides: [
                  ...overrides(),
                  promotionsRepositoryProvider
                      .overrideWithValue(_FakePromoRepo()),
                  postPromotionProvider('p1').overrideWith(
                    (ref) async => CasePromotionState(
                      promotion: promo,
                      canPromote: canPromote,
                      quote: _quote,
                    ),
                  ),
                ],
                child: MaterialApp.router(
                  theme: AppTheme.dark(),
                  builder: frame,
                  routerConfig: router,
                ),
              ),
            );
            await tester.pump();
            await tester.pump();
            expect(find.byType(PostPromoRow), findsOneWidget);
            expect(find.text(t.t('boost.stats.open')), findsOneWidget);
            expect(
              find.text(
                t.t(
                  promo?.isRunning ?? false
                      ? 'promote.status.active'
                      : 'promote.post.title',
                ),
              ),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
          });
        }

        // 7. «Справочник», every section opened.
        testWidgets('guide screen, all sections open', (tester) async {
          await pump(tester, const GuideScreen(), overrides: overrides());
          expect(tester.takeException(), isNull);
          for (var i = 1; i <= GuideScreen.sectionCount; i++) {
            final s = find.byKey(ValueKey('guide-s$i'));
            await tester.scrollUntilVisible(
              s,
              200,
              scrollable: find
                  .descendant(
                    of: find.byKey(const ValueKey('guide-list')),
                    matching: find.byType(Scrollable),
                  )
                  .first,
            );
            await tester.tap(
              find.descendant(of: s, matching: find.byType(AppPressable)),
            );
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
          }
          await scrollThrough(tester);
        });

        // 8. An attorney's profile with posts: the icon tabs.
        for (final self in [false, true]) {
          testWidgets(
              'attorney profile with posts (${self ? 'own' : 'visitor'})',
              (tester) async {
            final social = FakeSocialRepository(
              posts: [
                for (var i = 0; i < 6; i++)
                  fakePost('p$i', withPhoto: i.isEven, mine: self),
              ],
            );
            await pump(
              tester,
              const AttorneyProfileScreen(username: 'jane.doe'),
              theme: AppTheme.dark(),
              overrides: overrides(
                social: social,
                user: self ? attorneyMe() : clientMe(),
                extra: [
                  attorneyProfileRepositoryProvider.overrideWithValue(
                    FakeAttorneyRepo(profile: attorneyProfile(isSelf: self)),
                  ),
                  practicesRepositoryProvider
                      .overrideWithValue(FakePracticesRepo()),
                  reviewsRepositoryProvider
                      .overrideWithValue(FakeReviewsRepo()),
                  clientProfileRepositoryProvider
                      .overrideWithValue(FakeClientRepo()),
                  clockProvider.overrideWithValue(() => kNow),
                  newsEnabledProvider.overrideWithValue(false),
                ],
              ),
            );
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('profile-tab-posts')),
              findsOneWidget,
            );
            expect(
              find.byKey(const ValueKey('profile-tab-reviews')),
              findsOneWidget,
            );
            expect(tester.takeException(), isNull);
            await scrollThrough(tester);
            await settle(tester);
          });
        }
      });
    }
  }
}

Post _insightsPost({bool video = false}) => Post(
      id: 'p1',
      author: const PostAuthor(
        id: 'a1',
        username: 'sofia.hernandez',
        firstName: 'Sofia',
        lastName: 'Hernandez',
        verified: true,
      ),
      title: 'Tenant rights in 5 points: what a landlord cannot do',
      body: 'Text',
      media: const [],
      tags: const [],
      likeCount: 12,
      commentCount: 3,
      likedByMe: false,
      savedByMe: false,
      isMine: true,
      createdAt: DateTime(2026, 10, 15, 9, 30),
      video: video ? const PostVideo(status: 'ready') : null,
    );

final _insights = PostInsights(
  postId: 'p1',
  publishedAt: DateTime(2026, 10, 15, 9, 30),
  totals: const InsightsCounts(
    impressions: 1234567,
    reach: 800123,
    likes: 12345,
    comments: 3456,
    saves: 4567,
    reposts: 2345,
    shares: 5678,
    profileVisits: 7890,
  ),
  reachFollowers: 200123,
  reachNonFollowers: 600000,
  days: [
    for (var i = 0; i < 7; i++)
      InsightsDay(
        date: DateTime(2026, 10, 12 + i),
        counts: InsightsCounts(impressions: 10000 * i, reach: 1000 * i),
      ),
  ],
);

CasePromotionState _promoState(String id) => CasePromotionState(
      canPromote: false,
      quote: const PromotionQuote(
        days: 7,
        priceCentsPerDay: 100,
        grossCents: 700,
        totalCents: 700,
        creditDaysAvailable: 0,
        creditDaysUsed: 0,
        maxDays: 30,
        enabled: true,
      ),
      promotion: id.isEmpty
          ? null
          : CasePromotion(
              id: id,
              status: PromotionStatus.active,
              days: 7,
              totalCents: 700,
              impressions: 50,
              target: PromotionTarget.post,
              postId: 'p1',
            ),
    );

const _draft = CaseDraft(
  practiceAreaId: 'p1',
  practiceI18nKey: 'practice.medical_malpractice.surgical_errors',
  practiceNameEn: 'Surgical Errors',
  practiceCode: 'medical_malpractice.surgical_errors',
  title: 'Ошибка при операции на колене, нога не сгибается уже полгода',
  description: 'После операции нога не сгибается, врач не отвечает.',
  privateDetails: 'Клиника «Здоровье», хирург Иванов',
  primaryStateCode: 'NY',
  city: 'Brooklyn',
  budgetIsPercent: true,
  budgetPercentBps: 3300,
  urgency: 'urgent',
);

final _files = [
  CasePhotoUpload(key: 1, bytes: Uint8List(0)),
  CasePhotoUpload(key: 2, bytes: Uint8List(0), name: 'video.mp4'),
  CasePhotoUpload(key: 3, bytes: Uint8List(0), name: 'report.pdf'),
];

Post _own(
  String id, {
  bool commentsEnabled = true,
  DateTime? archivedAt,
}) =>
    Post(
      id: id,
      author: const PostAuthor(
        id: 'a1',
        username: 'sofia.hernandez',
        firstName: 'Sofia',
        lastName: 'Hernandez',
        verified: true,
      ),
      title: 'Title $id',
      body: 'Text of $id',
      media: const [],
      tags: const [],
      likeCount: 3,
      commentCount: 2,
      likedByMe: false,
      savedByMe: false,
      isMine: true,
      createdAt: DateTime(2026, 10, 14),
      commentsEnabled: commentsEnabled,
      archivedAt: archivedAt,
    );

class _ArchiveRepo extends FakeSocialRepository {
  List<Post> archived = const [];

  @override
  Future<CursorPage<Post>> archivedPosts({String? cursor}) async =>
      CursorPage(items: archived);
}

const _quote = PromotionQuote(
  days: 3,
  priceCentsPerDay: 500,
  grossCents: 1500,
  totalCents: 0,
  creditDaysAvailable: 0,
  creditDaysUsed: 0,
  maxDays: 14,
  enabled: true,
  dailyBudgetCents: 500,
  maxDailyBudgetCents: 5000,
  budgetPresetsCents: [500, 1000],
  durationPresets: [3, 7],
  estReachMin: 900,
  estReachMax: 1500,
  ctaTypes: ['more'],
);

class _FakePromoRepo extends PromotionsRepository {
  _FakePromoRepo() : super(Dio());

  @override
  Future<PromotionQuote> quote(
    int days, {
    int? dailyBudgetCents,
    PromotionTarget target = PromotionTarget.case_,
  }) async =>
      _quote;
}

CasePromotion _promo(PromotionStatus s) => CasePromotion(
      id: 'pr1',
      target: PromotionTarget.post,
      postId: 'p1',
      status: s,
      days: 3,
      totalCents: 1500,
      impressions: 10,
    );
