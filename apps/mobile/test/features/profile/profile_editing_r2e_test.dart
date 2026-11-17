// Detective R2-A batch E (14.11): profile editing.
// #6 failed avatar upload, #7 pending firm, #8 assistant @username,
// #19 client check running, #23 reviews summary error, #24 firm screen,
// #25 leaving mid-save.
import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/application/avatar_upload_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/firm_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/data/team_repository.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import 'profile_fakes.dart';

Future<void> _pump(
  WidgetTester tester,
  Widget screen, {
  CurrentUser? user,
  List<Override> overrides = const [],
}) async {
  tester.view.physicalSize = const Size(390, 844) * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final wrap = await profileWrapper(
    AppTheme.light(),
    user: user,
    overrides: overrides,
  );
  await tester.pumpWidget(wrap(screen));
  await tester.pumpAndSettle();
}

Future<void> _teardown(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(Duration.zero);
}

OwnAttorneyProfile _own({List<String> firms = const []}) => OwnAttorneyProfile(
      id: 'att-1',
      username: 'jane.doe',
      firstName: 'Jane',
      lastName: 'Doe',
      verification: AttorneyVerification.verified,
      verifiedBadge: true,
      firms: firms,
      firmName: firms.isEmpty ? null : firms.first,
    );

/// Records the assistant's approval requests.
class _FakeTeam implements TeamRepository {
  final sent = <(RequestKind, Map<String, Object?>)>[];

  @override
  Future<AssistantRequest> createRequest(
    RequestKind kind,
    Map<String, Object?> payload,
  ) async {
    sent.add((kind, payload));
    throw StateError('not needed: the screen only shows a snackbar');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Current user pinned for container tests.
class _FixedUser extends CurrentUserController {
  _FixedUser(this._user);

  final CurrentUser _user;

  @override
  CurrentUserState build() => CurrentUserState.ready(_user);
}

/// Signed in as the firm's owner (`att-1`, as [attorneyMe]).
class _OwnerSession extends SessionController {
  @override
  SessionState? build() => SessionState(
        accessToken: 'test-access-token',
        sub: 'att-1',
        role: 'attorney',
        sid: 's1',
        verified: true,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2030),
      );
}

/// [updateOwn] waits for [hold]; [fetchOwn] calls are counted.
class _HeldAttorneyRepo extends FakeAttorneyRepo {
  _HeldAttorneyRepo() : super(profile: attorneyProfile(), own: _own());

  final hold = Completer<void>();
  int reads = 0;

  @override
  Future<OwnAttorneyProfile> fetchOwn() async {
    reads++;
    return own!;
  }

  @override
  Future<OwnAttorneyProfile> updateOwn(AttorneyProfilePatch patch) async {
    patches.add(patch);
    await hold.future;
    return own!;
  }
}

/// The @username check waits for [answer].
class _SlowCheckRepo extends FakeAttorneyRepo {
  _SlowCheckRepo() : super(profile: attorneyProfile());

  final answer = Completer<UsernameCheck>();

  @override
  Future<UsernameCheck> checkUsername(
    String username, {
    String? firstName,
    String? lastName,
  }) =>
      answer.future;
}

Finder _field(String label) => find.byWidgetPredicate(
      (w) => w is AppTextField && w.semanticLabel == label,
    );

void main() {
  setUpAll(initializeDateFormatting);

  test('#6: a failed avatar upload is not shown as the profile photo',
      () async {
    final jpeg = Uint8List.fromList([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4]);
    final repo = FakeAvatarRepo(me: attorneyMe())..uploadFailures = 1;
    final c = ProviderContainer(
      overrides: [
        avatarUploadRepositoryProvider.overrideWithValue(repo),
        currentUserControllerProvider
            .overrideWith(() => _FixedUser(attorneyMe())),
      ],
    );
    addTearDown(c.dispose);
    final sub = c.listen(avatarUploadControllerProvider, (_, __) {});
    addTearDown(sub.close);
    await c.read(avatarUploadControllerProvider.notifier).start(jpeg);
    final failed = c.read(avatarUploadControllerProvider);
    expect(failed.stage, AvatarUploadStage.failed);
    // The photo field keeps the picked bytes for its Retry …
    expect(failed.preview, jpeg);
    // … but the profile header goes back to the account's real photo.
    expect(failed.shownPreview, isNull);
    await c.read(avatarUploadControllerProvider.notifier).retry();
    expect(c.read(avatarUploadControllerProvider).shownPreview, jpeg);
  });

  testWidgets('#7: a firm typed but not «added» is saved with the profile',
      (tester) async {
    final repo = FakeAttorneyRepo(profile: attorneyProfile(), own: _own());
    await _pump(
      tester,
      const AttorneyProfileEditScreen(),
      user: attorneyMe(),
      overrides: profileOverrides(attorneys: repo),
    );
    final firmField = find.descendant(
      of: _field('Firm name'),
      matching: find.byType(TextField),
    );
    await tester.ensureVisible(firmField);
    await tester.enterText(firmField, 'Doe Legal');
    await tester.tap(find.byKey(const ValueKey('profile-save')));
    await tester.pumpAndSettle();
    expect(repo.patches.single.firms, ['Doe Legal']);
    await _teardown(tester);
  });

  testWidgets('#8: an assistant cannot edit the @username (read-only field)',
      (tester) async {
    final repo = FakeAttorneyRepo(profile: attorneyProfile(), own: _own());
    final team = _FakeTeam();
    await _pump(
      tester,
      const AttorneyProfileEditScreen(),
      user: attorneyMe(),
      overrides: [
        ...profileOverrides(attorneys: repo),
        isAssistantProvider.overrideWithValue(true),
        teamRepositoryProvider.overrideWithValue(team),
      ],
    );
    final field = tester.widget<AppTextField>(
      find.byKey(const ValueKey('username-field')),
    );
    expect(field.enabled, isFalse);
    // Other fields still go into the request.
    await tester.enterText(
      find.descendant(
        of: find.byWidgetPredicate(
          (w) => w is AppTextField && w.label == 'First name',
        ),
        matching: find.byType(TextField),
      ),
      'Janet',
    );
    await tester.tap(find.byKey(const ValueKey('profile-save')));
    await tester.pumpAndSettle();
    expect(team.sent.single.$1, RequestKind.profileEdit);
    expect(team.sent.single.$2, {'firstName': 'Janet'});
    expect(repo.patches, isEmpty);
    await _teardown(tester);
  });

  testWidgets('#19: the client editor does not save while @username is checked',
      (tester) async {
    final attorneys = _SlowCheckRepo();
    final clients = FakeClientRepo();
    await _pump(
      tester,
      const ClientProfileEditScreen(),
      user: clientMe(),
      overrides: profileOverrides(attorneys: attorneys, clients: clients),
    );
    final username = find.descendant(
      of: find.byWidgetPredicate(
        (w) => w is AppTextField && w.label == 'Username',
      ),
      matching: find.byType(TextField),
    );
    await tester.enterText(username, 'anna_new');
    await tester.pump(const Duration(milliseconds: 500));
    final save = find.widgetWithText(AppButton, 'Save');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pump();
    expect(clients.prefs, isEmpty);
    attorneys.answer
        .complete(const UsernameCheck(username: 'anna_new', available: true));
    await tester.pumpAndSettle();
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(clients.prefs, hasLength(1));
    await _teardown(tester);
  });

  testWidgets('#25: leaving while Save runs still refreshes the own profile',
      (tester) async {
    final repo = _HeldAttorneyRepo();
    final show = ValueNotifier(true);
    addTearDown(show.dispose);
    await _pump(
      tester,
      ValueListenableBuilder<bool>(
        valueListenable: show,
        builder: (_, on, __) =>
            on ? const AttorneyProfileEditScreen() : const SizedBox.shrink(),
      ),
      user: attorneyMe(),
      overrides: profileOverrides(attorneys: repo),
    );
    expect(repo.reads, 1);
    final firmField = find.descendant(
      of: _field('Firm name'),
      matching: find.byType(TextField),
    );
    await tester.ensureVisible(firmField);
    await tester.enterText(firmField, 'Doe Legal');
    await tester.tap(find.byKey(const ValueKey('profile-save')));
    await tester.pump();
    expect(repo.patches, hasLength(1));
    // The user leaves before the server answers.
    show.value = false;
    await tester.pump();
    repo.hold.complete();
    await tester.pumpAndSettle();
    // The kept (5-minute) own profile was invalidated: the next open reads
    // the saved one instead of the old copy.
    show.value = true;
    await tester.pumpAndSettle();
    expect(repo.reads, 2);
    await _teardown(tester);
  });

  testWidgets('#23: a failed reviews summary shows an error with Retry',
      (tester) async {
    final reviews = FakeReviewsRepo(
      pages: [
        [review(0)],
      ],
    )..summaryError = Exception('boom');
    await _pump(
      tester,
      const AttorneyProfileScreen(username: 'jane.doe'),
      user: clientMe(),
      overrides: profileOverrides(reviews: reviews),
    );
    await tester
        .ensureVisible(find.byKey(const ValueKey('profile-tab-reviews')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('profile-tab-reviews')));
    await tester.pumpAndSettle();
    final retry = find.byKey(const ValueKey('reviews-summary-retry'));
    await tester.ensureVisible(retry);
    expect(find.text("Couldn't load reviews."), findsOneWidget);
    reviews
      ..summaryError = null
      ..summaryValue = summaryWithReviews;
    await tester.tap(retry);
    await tester.pumpAndSettle();
    expect(retry, findsNothing);
    await _teardown(tester);
  });

  group('#24 firm screen', () {
    testWidgets('a load error says what went wrong, with Retry',
        (tester) async {
      await _pump(
        tester,
        const FirmScreen(),
        user: attorneyMe(),
        overrides: [
          ...profileOverrides(),
          myFirmProvider.overrideWith((ref) => throw Exception('boom')),
        ],
      );
      expect(find.byType(AppErrorState), findsOneWidget);
      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      await _teardown(tester);
    });

    testWidgets('no firm without a name', (tester) async {
      await _pump(
        tester,
        const FirmScreen(),
        user: attorneyMe(),
        overrides: [
          ...profileOverrides(),
          myFirmProvider.overrideWith((ref) async => null),
        ],
      );
      AppButton create() =>
          tester.widget<AppButton>(find.byKey(const ValueKey('firm-create')));
      expect(create().onPressed, isNull);
      await tester.enterText(find.byType(TextField).first, '   ');
      await tester.pump();
      expect(create().onPressed, isNull);
      await tester.enterText(find.byType(TextField).first, 'Doe Legal');
      await tester.pump();
      expect(create().onPressed, isNotNull);
      await _teardown(tester);
    });

    testWidgets('«Remove» asks first; Cancel keeps the lawyer', (tester) async {
      final me = attorneyMe();
      final firm = api.FirmDto.fromJson({
        'id': 'firm-1',
        'name': 'Doe & Partners',
        'ownerId': me.id,
        'states': <String>[],
        'members': [
          {
            'attorneyId': me.id,
            'firstName': 'Jane',
            'lastName': 'Doe',
            'role': 'owner',
            'status': 'active',
            'states': <String>[],
          },
          {
            'attorneyId': 'att-2',
            'firstName': 'Bob',
            'lastName': 'Roe',
            'role': 'member',
            'status': 'active',
            'states': <String>[],
          },
        ],
      });
      await _pump(
        tester,
        const FirmScreen(),
        user: me,
        overrides: [
          ...profileOverrides(),
          myFirmProvider.overrideWith((ref) async => firm),
          sessionControllerProvider.overrideWith(_OwnerSession.new),
        ],
      );
      await tester.tap(find.byKey(const ValueKey('firm-remove-att-2')));
      await tester.pumpAndSettle();
      expect(find.textContaining('Remove Bob Roe?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Bob Roe'), findsOneWidget);
      await _teardown(tester);
    });

    // Firms audit 16.11 (PR-2): the owner hands the firm over or closes it,
    // both confirmed first.
    testWidgets(
        'owner: «Transfer ownership» picks a lawyer and asks; '
        '«Close firm» asks', (tester) async {
      final me = attorneyMe();
      final firm = api.FirmDto.fromJson({
        'id': 'firm-1',
        'name': 'Doe & Partners',
        'ownerId': me.id,
        'states': <String>[],
        'members': [
          {
            'attorneyId': me.id,
            'firstName': 'Jane',
            'lastName': 'Doe',
            'role': 'owner',
            'status': 'active',
            'states': <String>[],
          },
          {
            'attorneyId': 'att-2',
            'firstName': 'Bob',
            'lastName': 'Roe',
            'role': 'member',
            'status': 'active',
            'states': <String>['IL'],
          },
          {
            'attorneyId': 'att-3',
            'firstName': 'Ann',
            'lastName': 'Poe',
            'role': 'member',
            'status': 'invited',
            'states': <String>[],
          },
        ],
      });
      await _pump(
        tester,
        const FirmScreen(),
        user: me,
        overrides: [
          ...profileOverrides(),
          myFirmProvider.overrideWith((ref) async => firm),
          sessionControllerProvider.overrideWith(_OwnerSession.new),
        ],
      );
      await tester.ensureVisible(find.byKey(const ValueKey('firm-transfer')));
      await tester.tap(find.byKey(const ValueKey('firm-transfer')));
      await tester.pumpAndSettle();
      expect(find.text('Choose the new owner'), findsOneWidget);
      // Only an active lawyer can take the firm.
      expect(find.byKey(const ValueKey('firm-heir-att-2')), findsOneWidget);
      expect(find.byKey(const ValueKey('firm-heir-att-3')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('firm-heir-att-2')));
      await tester.pumpAndSettle();
      expect(find.text('Make Bob Roe the owner?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.byKey(const ValueKey('firm-close')));
      await tester.tap(find.byKey(const ValueKey('firm-close')));
      await tester.pumpAndSettle();
      expect(find.text('Close the firm?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Doe & Partners'), findsOneWidget);
      await _teardown(tester);
    });
  });
}
