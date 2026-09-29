import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/deeplinks/deep_link_routes.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/application/avatar_upload_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/data/profile_mappers.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/practices_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/review_form_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/verification_required_screen.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart';

import 'package:lawbid_api/lawbid_api.dart' as api;

import 'profile_fakes.dart';

Future<void> _pumpScreen(
  WidgetTester tester,
  Widget screen, {
  CurrentUser? user,
  List<Override> overrides = const [],
  double textScale = 1,
}) async {
  tester.view.physicalSize = const Size(390, 844) * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final wrap = await profileWrapper(
    AppTheme.light(),
    user: user,
    overrides: overrides,
    textScale: textScale,
  );
  await tester.pumpWidget(wrap(screen));
  await tester.pumpAndSettle();
}

Future<void> _teardown(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(Duration.zero);
}

void main() {
  setUpAll(initializeDateFormatting);

  group('attorney profile (docs/03 §4.2)', () {
    testWidgets('someone else\'s profile: header, blue check, rating counter, chips, Follow + Share',
        (tester) async {
      await _pumpScreen(
        tester,
        const AttorneyProfileScreen(username: 'jane.doe'),
        user: clientMe(),
        overrides: profileOverrides(),
      );
      expect(find.textContaining('@jane.doe'), findsOneWidget);
      expect(find.byType(VerifiedBadge), findsOneWidget);
      expect(find.text('Jane Doe'), findsOneWidget);
      expect(find.text('4.5'), findsOneWidget);
      expect(find.text('12 reviews'), findsOneWidget);
      // Owner 2026-09-29: the "@username · Attorney" caption is gone; the
      // handle is the centered title (asserted above).
      expect(find.textContaining('Family and immigration attorney'), findsOneWidget);
      expect(find.text('Doe & Partners LLP'), findsOneWidget);
      // Two picked leaves of one category are grouped; a single one isn't.
      expect(find.text('Family Law · 2'), findsOneWidget);
      expect(find.text('Work Visas'), findsOneWidget);
      expect(find.text('New York'), findsOneWidget);
      expect(find.text('1,280'), findsOneWidget);
      expect(find.text('Follow'), findsOneWidget);
      expect(find.bySemanticsLabel('Share'), findsOneWidget);
      expect(find.text('Edit'), findsNothing);
      // Owner decision (OQ-014): "Message" leads to the Chats screen.
      expect(find.text('Message'), findsOneWidget);
      await _teardown(tester);
    });

    testWidgets('header shows the attorney photo from GET /attorneys/:username, not initials', (tester) async {
      await _pumpScreen(
        tester,
        const AttorneyProfileScreen(username: 'jane.doe'),
        user: clientMe(),
        overrides: profileOverrides(
          attorneys: FakeAttorneyRepo(profile: attorneyProfile(avatarUrl: 'https://media.test/jane_w256')),
        ),
      );
      final header = tester.widget<ProfileAvatar>(find.byType(ProfileAvatar).first);
      expect(header.url, 'https://media.test/jane_w256');
      // The test binding answers every HTTP request with 400; the failed
      // image load is expected here.
      tester.takeException();
      await _teardown(tester);
      tester.takeException();
    });

    test('public profile mapper prefers the 256 px variant, falls back to the main photo', () {
      Map<String, Object?> json(String? main, String? small) => {
            'id': 'att-1',
            'username': 'jane.doe',
            'firstName': 'Jane',
            'lastName': 'Doe',
            'bio': null,
            'firmName': null,
            'avatarUrl': main,
            'avatarUrl256': small,
            'languages': ['en'],
            'verifiedBadge': true,
            'licensedStates': <Object?>[],
            'practiceAreas': <Object?>[],
            'rating': {'avg': 0, 'count': 0},
            'counters': {'posts': 0, 'followers': 0, 'following': 0},
            'isSelf': false,
            'isFollowing': false,
          };
      PublicAttorneyProfile map(String? main, String? small) =>
          ProfileMappers.publicProfile(api.PublicAttorneyProfileDto.fromJson(json(main, small)));
      expect(map('https://m/a', 'https://m/a_w256').avatarUrl, 'https://m/a_w256');
      expect(map('https://m/a', null).avatarUrl, 'https://m/a');
      expect(map(null, null).avatarUrl, isNull);
    });

    testWidgets('own profile shows Edit + Share instead of Follow', (tester) async {
      await _pumpScreen(
        tester,
        const AttorneyProfileScreen(username: 'jane.doe'),
        user: attorneyMe(),
        overrides: profileOverrides(attorneys: FakeAttorneyRepo(profile: attorneyProfile(isSelf: true))),
      );
      expect(find.text('Edit'), findsOneWidget);
      expect(find.bySemanticsLabel('Share'), findsOneWidget);
      expect(find.text('Follow'), findsNothing);
      await _teardown(tester);
    });

    testWidgets('"New — no reviews": dash instead of the number, empty reviews tab',
        (tester) async {
      await _pumpScreen(
        tester,
        const AttorneyProfileScreen(username: 'jane.doe'),
        user: clientMe(),
        overrides: profileOverrides(
          attorneys: FakeAttorneyRepo(profile: attorneyProfile(withReviews: false, verified: false)),
        ),
      );
      expect(find.text('New'), findsOneWidget);
      expect(find.text('—'), findsOneWidget);
      // unverified → no blue check (docs/03 §6.3)
      expect(find.byType(VerifiedBadge), findsNothing);
      // tap the rating counter → Reviews tab
      await tester.tap(find.text('New'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('This attorney has no reviews yet.'), 300, scrollable: find.byType(Scrollable).first);
      expect(find.text('This attorney has no reviews yet.'), findsOneWidget);
      await _teardown(tester);
    });

    testWidgets('reviews tab: "Anna K." cards, summary distribution, cursor pagination', (tester) async {
      final reviews = FakeReviewsRepo(
        pages: [
          [for (var i = 0; i < 3; i++) review(i, edited: i == 0)],
          [review(10, rating: 4)],
        ],
        summaryValue: summaryWithReviews,
      );
      await _pumpScreen(
        tester,
        const AttorneyProfileScreen(username: 'jane.doe'),
        user: clientMe(),
        overrides: profileOverrides(reviews: reviews),
      );
      await tester.ensureVisible(find.byKey(const ValueKey('profile-tab-reviews')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('profile-tab-reviews')));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.byType(ReviewCard).first, 300, scrollable: find.byType(Scrollable).first);
      expect(find.byType(ReviewSummaryPanel), findsOneWidget);
      expect(find.text('Anna K.'), findsWidgets);
      expect(find.text('Edited'), findsOneWidget);
      await tester.drag(find.byType(ListView).first, const Offset(0, -4000));
      await tester.pumpAndSettle();
      expect(reviews.listCursors, [null, '1']);
      expect(find.text("That's all the reviews"), findsOneWidget);
      await _teardown(tester);
    });

    testWidgets('404 (unknown, suspended, or a client) → friendly "Profile unavailable"', (tester) async {
      await _pumpScreen(
        tester,
        const AttorneyProfileScreen(username: 'some.client'),
        user: clientMe(),
        overrides: profileOverrides(attorneys: FakeAttorneyRepo(error: notFound)),
      );
      expect(find.text('Profile unavailable'), findsOneWidget);
      expect(find.text('Back'), findsWidgets);
      await _teardown(tester);
    });

    testWidgets('offline → offline state; other errors → error + Retry that reloads', (tester) async {
      final repo = FakeAttorneyRepo(error: offline);
      await _pumpScreen(
        tester,
        const AttorneyProfileScreen(username: 'jane.doe'),
        user: clientMe(),
        overrides: profileOverrides(attorneys: repo),
      );
      expect(find.byType(AppOfflineState), findsOneWidget);
      repo
        ..error = null
        ..profile = attorneyProfile();
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.textContaining('@jane.doe'), findsOneWidget);
      await _teardown(tester);
    });

    testWidgets('loading shows the skeleton', (tester) async {
      final wrap = await profileWrapper(AppTheme.light(), user: clientMe(), overrides: profileOverrides());
      await tester.pumpWidget(wrap(const AttorneyProfileScreen(username: 'jane.doe')));
      expect(find.byType(AttorneyProfileSkeleton), findsOneWidget);
      await tester.pumpAndSettle();
      await _teardown(tester);
    });

    testWidgets('200% text scale: no overflow', (tester) async {
      await _pumpScreen(
        tester,
        const AttorneyProfileScreen(username: 'jane.doe'),
        user: clientMe(),
        overrides: profileOverrides(),
        textScale: 2,
      );
      expect(tester.takeException(), isNull);
      await _teardown(tester);
    });
  });

  group('verification gates (docs/03 §1, §6.4)', () {
    for (final status in ['unverified', 'pending', 'rejected']) {
      test('$status attorney: "+" redirects to the verification gate', () {
        final redirect = AppRouterGuard.redirect(
          AppRoutes.create,
          GuardSnapshot(
            startup: StartupStatus.ready,
            hasSession: true,
            user: CurrentUserState.ready(attorneyMe(status: status)),
          ),
        );
        expect(redirect, AppRoutes.verificationRequired);
      });
    }

    test('verified attorney and client open "+" normally', () {
      for (final user in [attorneyMe(), clientMe()]) {
        expect(
          AppRouterGuard.redirect(
            AppRoutes.create,
            GuardSnapshot(startup: StartupStatus.ready, hasSession: true, user: CurrentUserState.ready(user)),
          ),
          isNull,
        );
      }
    });

    testWidgets('Cases tab shows "Complete verification" for a pending attorney', (tester) async {
      await _pumpScreen(tester, const MineScreen(), user: attorneyMe(status: 'pending'));
      expect(find.byType(VerificationRequiredView), findsOneWidget);
      expect(find.text('Complete verification'), findsWidgets);
      await _teardown(tester);
    });

    testWidgets('Cases tab is not gated for a verified attorney', (tester) async {
      await _pumpScreen(tester, const MineScreen(), user: attorneyMe());
      expect(find.byType(VerificationRequiredView), findsNothing);
      await _teardown(tester);
    });

    testWidgets('unverified attorney cannot pick practices (locked, nothing fetched)', (tester) async {
      final practices = FakePracticesRepo();
      await _pumpScreen(
        tester,
        const PracticesScreen(),
        user: attorneyMe(status: 'unverified'),
        overrides: profileOverrides(practices: practices),
      );
      expect(find.text('Available after verification'), findsOneWidget);
      expect(find.byType(PracticesEditor), findsNothing);
      expect(practices.replaced, isEmpty);
      await _teardown(tester);
    });
  });

  group('practices (docs/03 §3.2)', () {
    testWidgets('select all in a category, chips on top, save replaces the full set', (tester) async {
      final practices = FakePracticesRepo(
        selected: const [
          SelectedPractice(id: 'l-vis', i18nKey: 'practice.imm.visas', nameEn: 'Work Visas', categoryId: 'cat-imm', categoryI18nKey: 'practice.imm'),
        ],
      );
      await _pumpScreen(tester, const PracticesScreen(), user: attorneyMe(), overrides: profileOverrides(practices: practices));
      expect(find.text('Selected (1)'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('category-cat-family')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('select-all-cat-family')));
      await tester.pumpAndSettle();
      expect(find.text('Selected (4)'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('practices-save')));
      await tester.pumpAndSettle();
      expect(practices.replaced.single.toSet(), {'l-vis', 'l-div', 'l-cus', 'l-adp'});
      expect(find.text('Practices saved.'), findsOneWidget);
      await _teardown(tester);
    });

    testWidgets('search filters leaves and shows "no results"', (tester) async {
      await _pumpScreen(tester, const PracticesScreen(), user: attorneyMe(), overrides: profileOverrides());
      await tester.enterText(find.byType(TextField).first, 'asyl');
      await tester.pumpAndSettle();
      expect(find.text('Asylum'), findsOneWidget);
      expect(find.text('Divorce'), findsNothing);
      await tester.enterText(find.byType(TextField).first, 'zzzz');
      await tester.pumpAndSettle();
      expect(find.text('No practice areas match your search.'), findsOneWidget);
      await _teardown(tester);
    });
  });

  group('review form (docs/03 §7)', () {
    testWidgets('submit: rating required, then published as "Anna K." with Edit (14 days)', (tester) async {
      final reviews = FakeReviewsRepo();
      await _pumpScreen(
        tester,
        const ReviewFormScreen(caseId: 'case-1'),
        user: clientMe(),
        overrides: profileOverrides(reviews: reviews),
      );
      expect(find.text('A review can\'t be deleted. You can edit it within 14 days.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('review-submit')));
      await tester.pumpAndSettle();
      expect(find.text('Please choose a rating'), findsOneWidget);
      expect(reviews.created, isEmpty);

      await tester.tap(find.byKey(const ValueKey('star-input-4')));
      await tester.enterText(find.byKey(const ValueKey('review-body')).first, 'Great work');
      await tester.tap(find.byKey(const ValueKey('review-submit')));
      await tester.pumpAndSettle();
      expect(reviews.created.single, ('case-1', 4, 'Great work'));
      expect(find.text('Anna K.'), findsOneWidget);
      expect(find.byKey(const ValueKey('review-edit')), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('review-edit')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('star-input-5')));
      await tester.tap(find.byKey(const ValueKey('review-submit')));
      await tester.pumpAndSettle();
      expect(reviews.updated.single.$1, 'new');
      expect(reviews.updated.single.$2, 5);
      expect(find.text('Edited'), findsOneWidget);
      await _teardown(tester);
    });

    testWidgets('opened without the review, it loads GET /cases/:caseId/review and edits it', (tester) async {
      final reviews = FakeReviewsRepo()
        ..own = Review(
          id: 'r-own',
          rating: 3,
          body: 'Good start',
          authorDisplayName: 'Anna K.',
          createdAt: kNow.subtract(const Duration(days: 2)),
          editableUntil: kNow.add(const Duration(days: 12)),
          editable: true,
        );
      await _pumpScreen(
        tester,
        const ReviewFormScreen(caseId: 'case-1'),
        user: clientMe(),
        overrides: profileOverrides(reviews: reviews),
      );
      expect(reviews.ownRequests, ['case-1']);
      expect(find.text('Good start'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('review-edit')));
      await tester.pumpAndSettle();
      // The form is prefilled with the stored review.
      final field = tester.widget<EditableText>(
        find.descendant(of: find.byKey(const ValueKey('review-body')).first, matching: find.byType(EditableText)),
      );
      expect(field.controller.text, 'Good start');
      await tester.tap(find.byKey(const ValueKey('star-input-5')));
      await tester.tap(find.byKey(const ValueKey('review-submit')));
      await tester.pumpAndSettle();
      expect(reviews.created, isEmpty);
      expect(reviews.updated.single, ('r-own', 5, 'Good start'));
      await _teardown(tester);
    });

    testWidgets('a review the server marks not editable is read-only', (tester) async {
      final reviews = FakeReviewsRepo()
        ..own = Review(
          id: 'r-hidden',
          rating: 2,
          body: 'meh',
          authorDisplayName: 'Anna K.',
          createdAt: kNow.subtract(const Duration(days: 1)),
          editableUntil: kNow.add(const Duration(days: 13)),
          editable: false,
        );
      await _pumpScreen(
        tester,
        const ReviewFormScreen(caseId: 'case-1'),
        user: clientMe(),
        overrides: profileOverrides(reviews: reviews),
      );
      expect(find.byKey(const ValueKey('review-locked')), findsOneWidget);
      expect(find.byKey(const ValueKey('review-edit')), findsNothing);
      await _teardown(tester);
    });

    testWidgets('loading the own review failed → error + Retry reloads it', (tester) async {
      final reviews = FakeReviewsRepo()..ownError = offline;
      await _pumpScreen(
        tester,
        const ReviewFormScreen(caseId: 'case-1'),
        user: clientMe(),
        overrides: profileOverrides(reviews: reviews),
      );
      expect(find.byType(AppOfflineState), findsOneWidget);
      reviews.ownError = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(reviews.ownRequests, ['case-1', 'case-1']);
      expect(find.byKey(const ValueKey('review-submit')), findsOneWidget);
      await _teardown(tester);
    });

    testWidgets('after 14 days the review is read-only', (tester) async {
      final old = Review(
        id: 'r-old',
        rating: 3,
        body: 'ok',
        authorDisplayName: 'Anna K.',
        createdAt: kNow.subtract(const Duration(days: 20)),
        editableUntil: kNow.subtract(const Duration(days: 6)),
      );
      await _pumpScreen(
        tester,
        ReviewFormScreen(caseId: 'case-1', existing: old),
        user: clientMe(),
        overrides: profileOverrides(),
      );
      expect(find.byKey(const ValueKey('review-locked')), findsOneWidget);
      expect(find.byKey(const ValueKey('review-edit')), findsNothing);
      await _teardown(tester);
    });

    testWidgets('server error is shown inline, localized', (tester) async {
      final reviews = FakeReviewsRepo()..createError = offline;
      await _pumpScreen(
        tester,
        const ReviewFormScreen(caseId: 'case-1'),
        user: clientMe(),
        overrides: profileOverrides(reviews: reviews),
      );
      await tester.tap(find.byKey(const ValueKey('star-input-5')));
      await tester.tap(find.byKey(const ValueKey('review-submit')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('review-error')), findsOneWidget);
      await _teardown(tester);
    });
  });

  group('client profile (docs/03 §5)', () {
    testWidgets('private profile: name, state, "My cases" lock + empty state, no counters', (tester) async {
      await _pumpScreen(tester, const ProfileScreen(), user: clientMe(), overrides: profileOverrides());
      expect(find.text('Anna Kowalski'), findsOneWidget);
      expect(find.text('California'), findsOneWidget);
      expect(find.text('Visible only to you'), findsOneWidget);
      expect(find.text('You have no cases yet'), findsOneWidget);
      expect(find.text('Followers'), findsNothing);
      await _teardown(tester);
    });

    testWidgets('error state with retry', (tester) async {
      final clients = FakeClientRepo(error: Exception('boom'));
      await _pumpScreen(tester, const ProfileScreen(), user: clientMe(), overrides: profileOverrides(clients: clients));
      expect(find.byType(AppErrorState), findsOneWidget);
      clients.error = null;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text('Anna Kowalski'), findsOneWidget);
      await _teardown(tester);
    });
  });

  group('attorney profile editor (docs/03 §4.1)', () {
    OwnAttorneyProfile own({DateTime? next}) => OwnAttorneyProfile(
          id: 'att-1',
          username: 'jane.doe',
          firstName: 'Jane',
          lastName: 'Doe',
          verification: AttorneyVerification.verified,
          verifiedBadge: true,
          usernameNextChangeAt: next,
        );

    testWidgets('username availability: taken is shown, available is saved', (tester) async {
      final repo = FakeAttorneyRepo(profile: attorneyProfile(), own: own())
        ..availability = {'taken.name': const UsernameCheck(username: 'taken.name', available: false, issue: UsernameIssue.taken)};
      await _pumpScreen(tester, const AttorneyProfileEditScreen(), user: attorneyMe(), overrides: profileOverrides(attorneys: repo));
      final field = find.descendant(of: find.byKey(const ValueKey('username-field')), matching: find.byType(TextField));
      await tester.enterText(field, 'taken.name');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(find.text('This @username is already taken.'), findsOneWidget);
      await tester.enterText(field, 'jane_new');
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(find.text('This @username is available.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('profile-save')));
      await tester.pumpAndSettle();
      expect(repo.patches.single.username, 'jane_new');
      await _teardown(tester);
    });

    testWidgets('30-day cooldown locks the username field', (tester) async {
      final repo = FakeAttorneyRepo(profile: attorneyProfile(), own: own(next: kNow.add(const Duration(days: 10))));
      await _pumpScreen(tester, const AttorneyProfileEditScreen(), user: attorneyMe(), overrides: profileOverrides(attorneys: repo));
      expect(find.textContaining('You can change your @username again on'), findsOneWidget);
      await _teardown(tester);
    });
  });

  group('avatar upload (presign → storage → confirm → attach)', () {
    final jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);

    test('happy path attaches the file and refreshes me', () async {
      final repo = FakeAvatarRepo(me: attorneyMe(avatarUrl: 'https://cdn.test/a.jpg'));
      final c = ProviderContainer(
        overrides: [
          avatarUploadRepositoryProvider.overrideWithValue(repo),
          currentUserControllerProvider.overrideWith(() => FixedController(attorneyMe())),
        ],
      );
      addTearDown(c.dispose);
      final sub = c.listen(avatarUploadControllerProvider, (_, __) {});
      addTearDown(sub.close);
      await c.read(avatarUploadControllerProvider.notifier).start(jpeg);
      expect(repo.steps, ['presign:image/jpeg:8', 'upload', 'confirm', 'attach:f1']);
      expect(c.read(avatarUploadControllerProvider).stage, AvatarUploadStage.done);
      expect(c.read(currentUserControllerProvider).user?.avatarUrl, 'https://cdn.test/a.jpg');
    });

    test('a failed upload can be retried with the same photo', () async {
      final repo = FakeAvatarRepo(me: attorneyMe())..uploadFailures = 1;
      final c = ProviderContainer(
        overrides: [
          avatarUploadRepositoryProvider.overrideWithValue(repo),
          currentUserControllerProvider.overrideWith(() => FixedController(attorneyMe())),
        ],
      );
      addTearDown(c.dispose);
      final sub = c.listen(avatarUploadControllerProvider, (_, __) {});
      addTearDown(sub.close);
      await c.read(avatarUploadControllerProvider.notifier).start(jpeg);
      expect(c.read(avatarUploadControllerProvider).stage, AvatarUploadStage.failed);
      await c.read(avatarUploadControllerProvider.notifier).retry();
      expect(c.read(avatarUploadControllerProvider).stage, AvatarUploadStage.done);
      expect(repo.steps.where((s) => s == 'upload'), hasLength(2));
    });

    test('leaving the screen cancels the in-flight upload and stops the pipeline', () async {
      final repo = FakeAvatarRepo(me: attorneyMe())..holdUpload = true;
      final c = ProviderContainer(overrides: [avatarUploadRepositoryProvider.overrideWithValue(repo)]);
      addTearDown(c.dispose);
      final sub = c.listen(avatarUploadControllerProvider, (_, __) {});
      final run = c.read(avatarUploadControllerProvider.notifier).start(jpeg);
      await pumpEventQueue();
      expect(c.read(avatarUploadControllerProvider).stage, AvatarUploadStage.uploading);
      expect(repo.lastCancellation?.isCancelled, isFalse);

      sub.close(); // autoDispose → ref.onDispose cancels
      await run;

      expect(repo.lastCancellation?.isCancelled, isTrue);
      expect(repo.steps, ['presign:image/jpeg:8', 'upload']);
    });

    test('rejects non-images before any network call', () async {
      final repo = FakeAvatarRepo(me: attorneyMe());
      final c = ProviderContainer(overrides: [avatarUploadRepositoryProvider.overrideWithValue(repo)]);
      addTearDown(c.dispose);
      final sub = c.listen(avatarUploadControllerProvider, (_, __) {});
      addTearDown(sub.close);
      await c.read(avatarUploadControllerProvider.notifier).start(Uint8List.fromList([1, 2, 3, 4]));
      expect(c.read(avatarUploadControllerProvider).stage, AvatarUploadStage.failed);
      expect(repo.steps, isEmpty);
    });

    test('sniffs JPEG / PNG / HEIC', () {
      expect(sniffImageMime(jpeg), 'image/jpeg');
      expect(sniffImageMime(Uint8List.fromList([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])), 'image/png');
      expect(
        sniffImageMime(Uint8List.fromList([0, 0, 0, 0x18, ...'ftypheic'.codeUnits])),
        'image/heic',
      );
    });
  });

  testWidgets('deep link lawbid.app/lawyer/:username opens the public profile', (tester) async {
    final router = GoRouter(
      initialLocation: '/feed',
      routes: [
        GoRoute(path: '/feed', builder: (_, __) => const Scaffold(body: Text('FEED'))),
        ...deepLinkRoutes(),
      ],
    );
    addTearDown(router.dispose);
    final wrap = await profileWrapper(AppTheme.light(), user: clientMe(), overrides: profileOverrides());
    // Reuse the wrapper's ProviderScope around a router app.
    final scoped = wrap(const SizedBox.shrink()) as ProviderScope;
    await tester.pumpWidget(
      ProviderScope(
        overrides: scoped.overrides,
        child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
      ),
    );
    router.go('/lawyer/jane.doe');
    await tester.pumpAndSettle();
    expect(find.byType(AttorneyProfileScreen), findsOneWidget);
    expect(find.textContaining('@jane.doe'), findsOneWidget);
    await _teardown(tester);
  });
}

/// Current user pinned for container tests.
class FixedController extends CurrentUserController {
  FixedController(this._user);

  final CurrentUser _user;

  @override
  CurrentUserState build() => CurrentUserState.ready(_user);
}
