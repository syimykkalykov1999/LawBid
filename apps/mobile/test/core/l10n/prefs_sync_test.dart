// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/theme/theme_mode_providers.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/theme/preferences_sync.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';
import 'l10n_test_harness.dart';

/// Copy of [u] with the account's language/theme replaced — what the
/// server's MeView would return after `PATCH /users/me`.
CurrentUser withPrefs(CurrentUser u, {String? uiLanguage, String? theme}) =>
    CurrentUser(
      id: u.id,
      role: u.role,
      status: u.status,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      emailVerified: u.emailVerified,
      phone: u.phone,
      phoneVerified: u.phoneVerified,
      uiLanguage: uiLanguage ?? u.uiLanguage,
      theme: theme ?? u.theme,
      requiredConsentsGranted: u.requiredConsentsGranted,
      onboarding: u.onboarding,
      missing: u.missing,
    );

/// Starts signed out; [signOut] simulates a logout (session gone → idle).
class SwitchableUserController extends FixedUserController {
  SwitchableUserController() : super(const CurrentUserState.idle());

  void signOut() => state = const CurrentUserState.idle();
}

/// Records the exact `PATCH /users/me` bodies; answers like the server.
class RecordingOnboardingRepository extends FakeOnboardingRepository {
  RecordingOnboardingRepository(super.me);

  final List<Map<String, String>> patches = [];
  ApiException? failWith;

  @override
  Future<CurrentUser> updateProfile({
    String? firstName,
    String? lastName,
    String? uiLanguage,
    String? theme,
  }) async {
    final body = {
      if (uiLanguage != null) 'uiLanguage': uiLanguage,
      if (theme != null) 'theme': theme,
    };
    patches.add(body);
    final failure = failWith;
    if (failure != null) throw failure;
    // ignore: join_return_with_assignment
    me = withPrefs(me, uiLanguage: uiLanguage, theme: theme);
    return me;
  }
}

/// G2 (leaf-1.5): docs/07 §8.1 "выбор хранится локально и на сервере";
/// language + theme changes PATCH /users/me when signed in, and the
/// account's values are applied after login.
void main() {
  late L10nHarness h;
  late RecordingOnboardingRepository repo;
  late ProviderContainer c;

  final returning = withPrefs(
    meFixture(completed: true, consents: true),
    uiLanguage: 'ru',
    theme: 'dark',
  );
  final brandNew = meFixture(); // server defaults: en / theme null (system)

  Future<void> boot({Map<String, Object> prefs = const {}}) async {
    h = await L10nHarness.create(prefsValues: prefs);
    repo = RecordingOnboardingRepository(returning);
    c = h.container(
      extra: [
        currentUserControllerProvider
            .overrideWith(SwitchableUserController.new),
        onboardingRepositoryProvider.overrideWithValue(repo),
      ],
    );
    // ignore: cascade_invocations
    c.listen(preferencesSyncProvider, (_, __) {});
    await c.read(themeModeControllerProvider.future);
    await c.read(languageControllerProvider.future);
    await settle();
  }

  Future<void> signIn(CurrentUser user) async {
    repo.me = user;
    c.read(currentUserControllerProvider.notifier).apply(user);
    await settle();
  }

  ThemeMode theme() => c.read(themeModeControllerProvider).value!;
  AppLanguage language() => c.read(languageControllerProvider).value!;

  test('signed out: changes stay local, nothing is sent', () async {
    await boot();
    await c
        .read(themeModeControllerProvider.notifier)
        .setThemeMode(ThemeMode.dark);
    await c
        .read(languageControllerProvider.notifier)
        .setLanguage(AppLanguage.ru);
    await settle();
    expect(repo.patches, isEmpty);
    expect(theme(), ThemeMode.dark);
  });

  test('login to an existing account applies the server language and theme',
      () async {
    await boot(
      prefs: {'design_system.theme_mode': 'light', 'l10n.language': 'en'},
    );
    await signIn(returning);

    expect(theme(), ThemeMode.dark);
    expect(language(), AppLanguage.ru);
    expect(
      repo.patches,
      isEmpty,
      reason: 'applying server values must not echo a PATCH',
    );
    expect(
      h.prefs.getString('l10n.language'),
      'ru',
      reason: 'persisted locally too',
    );
  });

  test('signed in: each change PATCHes only its own field and refreshes me',
      () async {
    await boot();
    await signIn(returning);

    await c
        .read(themeModeControllerProvider.notifier)
        .setThemeMode(ThemeMode.light);
    await settle();
    expect(repo.patches, [
      {'theme': 'light'},
    ]);
    expect(c.read(currentUserControllerProvider).user!.theme, 'light');

    await c
        .read(languageControllerProvider.notifier)
        .setLanguage(AppLanguage.en);
    await settle();
    expect(repo.patches.last, {'uiLanguage': 'en'});
    expect(c.read(currentUserControllerProvider).user!.uiLanguage, 'en');

    // Re-selecting the current value sends nothing.
    await c
        .read(themeModeControllerProvider.notifier)
        .setThemeMode(ThemeMode.light);
    await settle();
    expect(repo.patches, hasLength(2));
  });

  test('new account: the welcome-screen choices are pushed, not overwritten',
      () async {
    await boot(
      prefs: {'design_system.theme_mode': 'dark', 'l10n.language': 'ru'},
    );
    await signIn(brandNew);

    expect(repo.patches, [
      {'uiLanguage': 'ru', 'theme': 'dark'},
    ]);
    expect(language(), AppLanguage.ru);
    expect(theme(), ThemeMode.dark);
  });

  test(
      'offline PATCH is kept pending and wins over the stale server value later',
      () async {
    await boot();
    await signIn(returning);
    repo.failWith = const ApiException(
      code: ApiException.networkErrorCode,
      message: 'offline',
    );

    await c
        .read(themeModeControllerProvider.notifier)
        .setThemeMode(ThemeMode.light);
    await settle();
    expect(repo.patches, [
      {'theme': 'light'},
    ]);
    expect(h.prefs.getString('prefs.sync.pending.theme'), isNotNull);

    // Back online; the next /users/me refresh (still the old dark theme)
    // retries instead of reverting the user's choice.
    repo.failWith = null;
    final patchesBefore = repo.patches.length;
    // A fresh MeView object, as GET /users/me would produce.
    c.read(currentUserControllerProvider.notifier).apply(withPrefs(returning));
    await settle();
    expect(repo.patches, hasLength(patchesBefore + 1), reason: 'retried once');
    expect(repo.patches.last, {'theme': 'light'});
    expect(theme(), ThemeMode.light);
    expect(c.read(currentUserControllerProvider).user!.theme, 'light');
    expect(h.prefs.getString('prefs.sync.pending.theme'), isNull);
  });

  test('cold start with an unsynced change: local value is pushed at login',
      () async {
    await boot(
      prefs: {
        'design_system.theme_mode': 'light',
        'l10n.language': 'ru',
        'prefs.sync.pending.theme': '1',
      },
    );
    await signIn(returning); // server: dark / ru

    expect(
      theme(),
      ThemeMode.light,
      reason: 'pending local change is not reverted',
    );
    expect(repo.patches, [
      {'theme': 'light'},
    ]);
  });

  test('a definitive server rejection is not retried forever', () async {
    await boot();
    await signIn(returning);
    repo.failWith = const ApiException(
      code: 'I18N_LANGUAGE_NOT_FOUND',
      message: 'Language is not available.',
      statusCode: 400,
    );
    await c
        .read(languageControllerProvider.notifier)
        .setLanguage(AppLanguage.fromCode('es'));
    await settle();
    expect(h.prefs.getString('prefs.sync.pending.language'), isNull);
  });

  test('logout clears pending flags so they never reach another account',
      () async {
    await boot();
    await signIn(returning);
    repo.failWith = const ApiException(
      code: ApiException.networkErrorCode,
      message: 'offline',
    );
    await c
        .read(themeModeControllerProvider.notifier)
        .setThemeMode(ThemeMode.light);
    await settle();
    expect(h.prefs.getString('prefs.sync.pending.theme'), isNotNull);

    (c.read(currentUserControllerProvider.notifier) as SwitchableUserController)
        .signOut();
    await settle();
    expect(h.prefs.getString('prefs.sync.pending.theme'), isNull);
  });
}
