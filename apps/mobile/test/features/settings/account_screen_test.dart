// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_catalog_provider.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/settings/account/application/account_providers.dart';
import 'package:lawbid/features/settings/account/data/account_repository.dart';
import 'package:lawbid/features/settings/account/domain/account_identifier.dart';
import 'package:lawbid/features/settings/account/presentation/screens/account_contact_flow_screen.dart';
import 'package:lawbid/features/settings/account/presentation/screens/account_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';

/// Settings → Account (docs/01 §10.3, §11 3A): identifier list with all
/// screen states, linking Apple/Google/phone/email, and changing the
/// phone with reauth + code on the new contact.
class FakeAccountRepository implements AccountRepository {
  FakeAccountRepository(this.onList);

  Future<List<AccountIdentifier>> Function() onList;
  final List<String> calls = [];
  Object? linkError;
  SocialLinkOutcome socialOutcome = SocialLinkOutcome.linked;

  @override
  Future<List<AccountIdentifier>> listIdentifiers() {
    calls.add('list');
    return onList();
  }

  @override
  Future<void> requestLinkCode(ContactType type, String value) async {
    calls.add('requestLinkCode:${type.name}:$value');
  }

  @override
  Future<void> linkContact(ContactType type, String value, String code) async {
    calls.add('linkContact:${type.name}:$value:$code');
    // ignore: only_throw_errors
    if (linkError != null) throw linkError!;
  }

  @override
  Future<SocialLinkOutcome> linkSocial(IdentifierProvider provider) async {
    calls.add('linkSocial:${provider.name}');
    // ignore: only_throw_errors
    if (linkError != null) throw linkError!;
    return socialOutcome;
  }
}

const _phone = AccountIdentifier(
  id: 'i1',
  provider: IdentifierProvider.phone,
  value: '+15551234567',
  verified: true,
  isPrimaryContact: true,
);
const _apple = AccountIdentifier(
  id: 'i2',
  provider: IdentifierProvider.apple,
  verified: true,
  isPrimaryContact: false,
);
const _extraEmail = AccountIdentifier(
  id: 'i3',
  provider: IdentifierProvider.email,
  value: 'second@example.com',
  verified: true,
  isPrimaryContact: false,
);

final _client = meFixture(
  role: UserRole.client,
  consents: true,
  firstName: 'Ann',
  lastName: 'Lee',
  phone: '+15551234567',
  phoneVerified: true,
  email: 'ann@example.com',
  emailVerified: true,
  completed: true,
);

Future<void> _enterOtp(WidgetTester tester, String code) async {
  final field = find.descendant(
    of: find.byType(AppOtpField),
    matching: find.byType(EditableText),
  );
  await tester.enterText(field.first, code);
  await tester.pumpAndSettle();
}

Future<void> _tearDown(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(Duration.zero);
}

void _tallView(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

Future<Widget Function(Widget)> _wrap(
  FakeAccountRepository accounts, {
  FakeOnboardingRepository? onboarding,
  double textScale = 1,
}) =>
    onboardingWrapper(
      AppTheme.light(),
      user: _client,
      repo: onboarding ?? FakeOnboardingRepository(_client),
      textScale: textScale,
      extra: [accountRepositoryProvider.overrideWithValue(accounts)],
    );

void main() {
  group('AccountScreen states', () {
    testWidgets('loading shows skeleton cards, not content', (tester) async {
      final pending = Completer<List<AccountIdentifier>>();
      final repo = FakeAccountRepository(() => pending.future);
      final wrap = await _wrap(repo);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.byType(AppSkeletonCard), findsWidgets);
      expect(find.bySemanticsLabel('Loading account details'), findsOneWidget);
      expect(find.text('Sign-in methods'.toUpperCase()), findsNothing);
      pending.complete(const []);
      await tester.pumpAndSettle();
      await _tearDown(tester);
    });

    testWidgets(
        'data: contacts, identifiers with badges, only unlinked social providers offered',
        (tester) async {
      _tallView(tester);
      final repo = FakeAccountRepository(
        () async => const [_phone, _apple, _extraEmail],
      );
      final wrap = await _wrap(repo);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Account'), findsOneWidget);
      expect(find.text('CONTACT DETAILS'), findsOneWidget);
      expect(find.text('SIGN-IN METHODS'), findsOneWidget);
      // Primary phone shows formatted in contacts + identifiers.
      expect(find.text('(555) 123-4567'), findsNWidgets(2));
      expect(find.text('ann@example.com'), findsOneWidget);
      expect(find.text('Primary contact'), findsOneWidget);
      expect(find.text('second@example.com'), findsOneWidget);
      expect(find.text('Connected'), findsOneWidget); // Apple row
      expect(find.text('Connect Apple'), findsNothing);
      expect(find.text('Connect Google'), findsOneWidget);
      expect(find.text('Change'), findsNWidgets(2));
      await _tearDown(tester);
    });

    testWidgets('empty: no identifiers explains it and still offers linking',
        (tester) async {
      _tallView(tester);
      final repo = FakeAccountRepository(() async => const []);
      final wrap = await _wrap(repo);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pumpAndSettle();

      expect(find.text('No sign-in methods yet.'), findsOneWidget);
      expect(find.text('Connect Apple'), findsOneWidget);
      expect(find.text('Connect Google'), findsOneWidget);
      await _tearDown(tester);
    });

    testWidgets('error: message + Retry re-fetches and recovers',
        (tester) async {
      _tallView(tester);
      var fail = true;
      final repo = FakeAccountRepository(() async {
        if (fail) {
          throw const ApiException(code: 'INTERNAL_ERROR', message: 'boom');
        }
        return const [_phone];
      });
      final wrap = await _wrap(repo);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pumpAndSettle();

      expect(find.text("Couldn't load your account details."), findsOneWidget);
      fail = false;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(repo.calls, ['list', 'list']);
      expect(find.text('Primary contact'), findsOneWidget);
      await _tearDown(tester);
    });

    testWidgets('offline: network failure shows the offline state with Retry',
        (tester) async {
      final repo = FakeAccountRepository(
        () async => throw const ApiException(
          code: ApiException.networkErrorCode,
          message: 'offline',
        ),
      );
      final wrap = await _wrap(repo);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pumpAndSettle();

      expect(find.byType(AppOfflineState), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      await _tearDown(tester);
    });

    testWidgets('200% text scale: no overflow', (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final repo = FakeAccountRepository(
        () async => const [_phone, _apple, _extraEmail],
      );
      final wrap = await _wrap(repo, textScale: 2);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await _tearDown(tester);
    });
  });

  group('linking Apple / Google (POST /auth/identifiers)', () {
    testWidgets('Connect Google links, confirms and reloads the list',
        (tester) async {
      _tallView(tester);
      var linked = false;
      final repo = FakeAccountRepository(
        () async => [
          _phone,
          if (linked)
            const AccountIdentifier(
              id: 'g',
              provider: IdentifierProvider.google,
              verified: true,
              isPrimaryContact: false,
            ),
        ],
      );
      final wrap = await _wrap(repo);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pumpAndSettle();

      linked = true;
      await tester.tap(find.text('Connect Google'));
      await tester.pumpAndSettle();
      expect(repo.calls, ['list', 'linkSocial:google', 'list']);
      expect(find.text('Sign-in method added'), findsOneWidget);
      expect(find.text('Connect Google'), findsNothing);
      await _tearDown(tester);
    });

    testWidgets(
        'already linked elsewhere shows the localized error, list unchanged',
        (tester) async {
      _tallView(tester);
      final repo = FakeAccountRepository(() async => const [_phone])
        ..linkError = const ApiException(
          code: ApiErrorCodes.identifierAlreadyLinked,
          message: 'linked',
        );
      final wrap = await _wrap(repo);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Connect Apple'));
      await tester.pumpAndSettle();
      expect(repo.calls, ['list', 'linkSocial:apple']);
      expect(find.byType(SnackBar), findsOneWidget);
      expect(find.text('Connect Apple'), findsOneWidget);
      await _tearDown(tester);
    });

    testWidgets('cancelling the native sheet is silent', (tester) async {
      _tallView(tester);
      final repo = FakeAccountRepository(() async => const [_phone])
        ..socialOutcome = SocialLinkOutcome.cancelled;
      final wrap = await _wrap(repo);
      await tester.pumpWidget(wrap(const AccountScreen()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Connect Apple'));
      await tester.pumpAndSettle();
      expect(find.byType(SnackBar), findsNothing);
      await _tearDown(tester);
    });
  });

  group('change phone: reauth + code on the new contact (§11 3A)', () {
    testWidgets('identity code to the current phone, then code to the new one',
        (tester) async {
      _tallView(tester);
      final onboarding = FakeOnboardingRepository(_client);
      final repo = FakeAccountRepository(() async => const [_phone]);
      final wrap = await _wrap(repo, onboarding: onboarding);
      await tester.pumpWidget(
        wrap(
          const AccountContactFlowScreen(
            type: ContactType.phone,
            mode: AccountContactMode.primary,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Change phone number'), findsOneWidget);
      await tester.enterText(find.byType(TextField).first, '2025550199');
      await tester.tap(find.text('Send code'));
      await tester.pumpAndSettle();
      // Reauth first: the code goes to the CURRENT verified phone.
      expect(onboarding.calls, ['requestReauthCode:+15551234567']);
      expect(find.text("Confirm it's you"), findsOneWidget);
      expect(find.textContaining('(555) 123-4567'), findsOneWidget);

      await _enterOtp(tester, '111111');
      expect(onboarding.calls, [
        'requestReauthCode:+15551234567',
        'reauth',
        'requestContactCode:+12025550199',
      ]);
      expect(find.text('Enter the code'), findsOneWidget);
      expect(find.textContaining('(202) 555-0199'), findsOneWidget);

      await _enterOtp(tester, '222222');
      expect(onboarding.calls.last, 'verifyContact');
      expect(find.text('All set'), findsOneWidget);
      expect(
        find.text('Your phone number is verified and saved.'),
        findsOneWidget,
      );
      await _tearDown(tester);
    });

    testWidgets('invalid phone is rejected locally; nothing is sent',
        (tester) async {
      _tallView(tester);
      final onboarding = FakeOnboardingRepository(_client);
      final wrap = await _wrap(
        FakeAccountRepository(() async => const []),
        onboarding: onboarding,
      );
      await tester.pumpWidget(
        wrap(
          const AccountContactFlowScreen(
            type: ContactType.phone,
            mode: AccountContactMode.primary,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, '123');
      await tester.tap(find.text('Send code'));
      await tester.pumpAndSettle();
      expect(onboarding.calls, isEmpty);
      expect(find.text('Enter a valid phone number'), findsOneWidget);
      await _tearDown(tester);
    });
  });

  testWidgets(
      'contact flow at 200% text scale: no overflow on entry or code step',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final repo = FakeAccountRepository(() async => const []);
    final wrap = await _wrap(repo, textScale: 2);
    await tester.pumpWidget(
      wrap(
        const AccountContactFlowScreen(
          type: ContactType.email,
          mode: AccountContactMode.link,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.enterText(find.byType(TextField).first, 'x@example.com');
    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the code'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await _tearDown(tester);
  });

  group('link an additional email (POST /auth/identifiers)', () {
    testWidgets('code to the new email → linked → success', (tester) async {
      _tallView(tester);
      final repo = FakeAccountRepository(() async => const [_phone]);
      final wrap = await _wrap(repo);
      await tester.pumpWidget(
        wrap(
          const AccountContactFlowScreen(
            type: ContactType.email,
            mode: AccountContactMode.link,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Sign-in email'), findsOneWidget);
      await tester.enterText(
        find.byType(TextField).first,
        ' Work@Example.com ',
      );
      await tester.tap(find.text('Send code'));
      await tester.pumpAndSettle();
      expect(repo.calls, ['requestLinkCode:email:work@example.com']);

      await _enterOtp(tester, '333333');
      expect(repo.calls.last, 'linkContact:email:work@example.com:333333');
      expect(
        find.text('You can now sign in with work@example.com.'),
        findsOneWidget,
      );
      await _tearDown(tester);
    });

    testWidgets(
        'a rejected code keeps the user on the code step with the error',
        (tester) async {
      _tallView(tester);
      final repo = FakeAccountRepository(() async => const [])
        ..linkError = const ApiException(
          code: ApiErrorCodes.authOtpInvalid,
          message: 'bad',
        );
      final wrap = await _wrap(repo);
      await tester.pumpWidget(
        wrap(
          const AccountContactFlowScreen(
            type: ContactType.email,
            mode: AccountContactMode.link,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField).first, 'x@example.com');
      await tester.tap(find.text('Send code'));
      await tester.pumpAndSettle();
      await _enterOtp(tester, '000000');
      expect(find.text('Enter the code'), findsOneWidget);
      expect(find.text('All set'), findsNothing);
      await _tearDown(tester);
    });
  });

  testWidgets('Settings → Account row opens the Account screen',
      (tester) async {
    _tallView(tester);
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final l10nDb = L10nDatabase(NativeDatabase.memory());
    addTearDown(l10nDb.close);
    final repo = FakeAccountRepository(() async => const [_phone]);
    final router = GoRouter(
      initialLocation: '/profile/settings',
      routes: [
        GoRoute(
          path: '/profile/settings',
          builder: (context, state) => const SettingsScreen(),
        ),
        ...accountRoutes(),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          l10nDatabaseProvider.overrideWithValue(l10nDb),
          currentUserControllerProvider.overrideWith(
            () => FixedUserController(CurrentUserState.ready(_client)),
          ),
          appStartupProvider
              .overrideWith(() => FixedStartup(StartupStatus.ready)),
          languageCatalogProvider.overrideWith((ref) async => kLanguageCatalog),
          onboardingRepositoryProvider
              .overrideWithValue(FakeOnboardingRepository(_client)),
          accountRepositoryProvider.overrideWithValue(repo),
        ],
        child:
            MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Account'));
    await tester.pumpAndSettle();
    expect(
      router.routerDelegate.currentConfiguration.last.matchedLocation,
      AccountRoutes.account,
    );
    expect(find.byType(AccountScreen), findsOneWidget);
    expect(find.text('Primary contact'), findsOneWidget);

    // Contact row → change-phone flow route.
    await tester.tap(find.text('Phone'));
    await tester.pumpAndSettle();
    expect(find.byType(AccountContactFlowScreen), findsOneWidget);
    expect(find.text('Change phone number'), findsOneWidget);
    await _tearDown(tester);
  });
}
