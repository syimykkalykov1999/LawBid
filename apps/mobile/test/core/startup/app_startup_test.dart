import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/core/startup/app_session.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/data/onboarding_repository.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-22 (client economy plan, package G): a signed-in start is
/// one `GET /me/session` — `me`, badges and flags come from it; neither
/// `GET /users/me` nor `GET /badges` is asked, and `/config/bootstrap` is
/// read from the phone when the config version did not move.
class _Session extends SessionController {
  _Session(this.result);

  final SessionBootstrapResult result;

  @override
  SessionState? build() => null;

  @override
  Future<SessionBootstrapResult> bootstrap() async {
    if (result == SessionBootstrapResult.signedIn) {
      state = SessionState(
        accessToken: 'at',
        sub: 'u1',
        role: 'client',
        sid: 's1',
        verified: false,
        subscriptionStatus: 'none',
        accessTokenExpiresAt: DateTime.utc(2030),
      );
    }
    return result;
  }
}

class _Flags extends FeatureFlagsController {
  final calls = <(String?, Map<String, bool>?)>[];

  @override
  FeatureFlagsState build() =>
      const FeatureFlagsState(flags: defaultFeatureFlags, appConfig: {});

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {
    calls.add((knownVersion, flags));
  }
}

class _L10n extends L10nCacheController {
  int refreshes = 0;

  @override
  Future<void> refreshInBackground() async {
    refreshes++;
  }
}

class _SessionLoader implements AppSessionLoader {
  _SessionLoader({this.fail = false});

  final bool fail;
  int calls = 0;

  @override
  Future<api.AppSessionDto> load() async {
    calls++;
    if (fail) throw StateError('old server');
    return api.AppSessionDto.fromJson({
      'me': _meJson,
      'badges': {
        'chatsUnread': 2,
        'notificationsUnread': 3,
        'total': 5,
        'iconBadge': true,
      },
      'bootstrapVersion': '17',
      'flags': {'video_posts': true},
      'unreadSupport': 1,
      'hasOngoingCalls': false,
      'client': {'timings': <String, num>{}},
    });
  }
}

const _meJson = {
  'id': 'u1',
  'role': 'client',
  'status': 'active',
  'firstName': 'Ann',
  'lastName': null,
  'email': 'a@b.co',
  'emailVerified': true,
  'phone': null,
  'phoneVerified': false,
  'uiLanguage': 'en',
  'theme': 'system',
  'requiredConsentsGranted': true,
  'pendingLegalDocuments': <Object>[],
  'passwordSet': true,
  'passwordRequired': false,
  'onboarding': {
    'currentStep': null,
    'completedAt': null,
    'data': <String, Object?>{},
  },
  'missing': <Object>[],
};

class _MeRepo implements OnboardingRepository {
  int fetches = 0;

  @override
  Future<CurrentUser> fetchMe() async {
    fetches++;
    throw StateError('must not be asked');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

void main() {
  late _Flags flags;
  late _L10n l10n;
  late _SessionLoader loader;
  late _MeRepo meRepo;

  Future<ProviderContainer> make({
    SessionBootstrapResult result = SessionBootstrapResult.signedIn,
    bool sessionFails = false,
  }) async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    SharedPreferences.setMockInitialValues({});
    final sp = await SharedPreferences.getInstance();
    final l10nDb = L10nDatabase(NativeDatabase.memory());
    addTearDown(l10nDb.close);
    flags = _Flags();
    l10n = _L10n();
    loader = _SessionLoader(fail: sessionFails);
    meRepo = _MeRepo();
    final c = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(sp),
        l10nDatabaseProvider.overrideWithValue(l10nDb),
        sessionControllerProvider.overrideWith(() => _Session(result)),
        featureFlagsControllerProvider.overrideWith(() => flags),
        l10nCacheControllerProvider.overrideWith(() => l10n),
        appSessionLoaderProvider.overrideWithValue(loader),
        onboardingRepositoryProvider.overrideWithValue(meRepo),
        startupL10nDelayProvider
            .overrideWithValue(const Duration(milliseconds: 20)),
      ],
    );
    addTearDown(c.dispose);
    // The router reads the user controller before the splash runs.
    c.read(currentUserControllerProvider);
    return c;
  }

  test('a signed-in start is one GET /me/session', () async {
    final c = await make();
    await c.read(appStartupProvider.notifier).run();
    expect(c.read(appStartupProvider), StartupStatus.ready);
    expect(loader.calls, 1);
    expect(meRepo.fetches, 0, reason: 'GET /users/me is not asked');
    final user = c.read(currentUserControllerProvider).user;
    expect(user?.role, UserRole.client);
    expect(user?.firstName, 'Ann');
    expect(flags.calls.length, 1);
    expect(flags.calls.single.$1, '17');
    expect(flags.calls.single.$2, {'video_posts': true});
    expect(c.read(appSessionProvider)?.unreadSupport, 1);
    // Translations are not on the critical path.
    expect(l10n.refreshes, 0);
    await Future<void>.delayed(const Duration(milliseconds: 60));
    expect(l10n.refreshes, 1);
  });

  test('the badges come from the session, GET /badges is not asked', () async {
    final c = await make();
    await c.read(appStartupProvider.notifier).run();
    c.read(badgesProvider);
    await Future<void>.delayed(Duration.zero);
    expect(c.read(badgesProvider).chats, 2);
    expect(c.read(badgesProvider).notifications, 3);
    await Future<void>.delayed(const Duration(milliseconds: 60));
  });

  test('an older server: the old GET /users/me path still works', () async {
    final c = await make(sessionFails: true);
    await c.read(appStartupProvider.notifier).run();
    expect(loader.calls, 1);
    expect(meRepo.fetches, 1);
    expect(flags.calls, [(null, null)]);
    expect(c.read(appStartupProvider), StartupStatus.ready);
    await Future<void>.delayed(const Duration(milliseconds: 60));
  });

  test('a guest start keeps bootstrap + translations', () async {
    final c = await make(result: SessionBootstrapResult.signedOut);
    await c.read(appStartupProvider.notifier).run();
    expect(loader.calls, 0);
    expect(flags.calls, [(null, null)]);
    expect(l10n.refreshes, 1);
    await Future<void>.delayed(const Duration(milliseconds: 60));
  });
}
