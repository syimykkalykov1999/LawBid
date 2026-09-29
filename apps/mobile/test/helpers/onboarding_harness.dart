import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_catalog_provider.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/data/onboarding_repository.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/domain/profile_input.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../features/social/social_fakes.dart';

/// CurrentUserController pinned to a fixed state (no session listening).
class FixedUserController extends CurrentUserController {
  FixedUserController(this._initial);

  final CurrentUserState _initial;

  @override
  CurrentUserState build() => _initial;

  /// No session in tests — "reload" keeps the fixed user.
  @override
  Future<CurrentUser?> load() async => state.user;
}

class FixedStartup extends AppStartupController {
  FixedStartup(this._status);

  final StartupStatus _status;

  @override
  StartupStatus build() => _status;
}

/// Records every call; answers with [me].
class FakeOnboardingRepository implements OnboardingRepository {
  FakeOnboardingRepository(this.me);

  CurrentUser me;
  final List<String> calls = [];
  List<ConsentDecision>? lastConsents;

  @override
  Future<CurrentUser> fetchMe() async {
    calls.add('fetchMe');
    return me;
  }

  @override
  Future<CurrentUser> updateProfile({String? firstName, String? lastName, String? uiLanguage, String? theme}) async {
    calls.add('updateProfile');
    return me;
  }

  @override
  Future<CurrentUser> setRole(UserRole role) async {
    calls.add('setRole:${role.name}');
    return me;
  }

  @override
  Future<CurrentUser> saveStep(OnboardingStepId step, [Map<String, dynamic>? data]) async {
    calls.add('saveStep:${step.name}');
    return me;
  }

  /// Last structured profile passed to [saveProfileStep].
  ProfileInput? lastProfile;

  @override
  Future<CurrentUser> saveProfileStep(OnboardingStepId next, ProfileInput profile) async {
    calls.add('saveProfileStep:${next.name}');
    lastProfile = profile;
    return me;
  }

  /// Thrown by [completeOnboarding] when set (e.g. a 403
  /// ONBOARDING_INCOMPLETE).
  Object? completeError;

  @override
  Future<CurrentUser> completeOnboarding() async {
    calls.add('complete');
    if (completeError != null) throw completeError!;
    return me;
  }

  @override
  Future<void> saveConsents(List<ConsentDecision> consents) async {
    calls.add('saveConsents');
    lastConsents = consents;
  }

  @override
  Future<void> requestReauthCode({required String channel, required String identifier}) async {
    calls.add('requestReauthCode:$identifier');
  }

  @override
  Future<String> reauth({required String identifier, required String code}) async {
    calls.add('reauth');
    return 'rt';
  }

  @override
  Future<void> requestContactCode({required ContactType type, required String value, String? reauthToken}) async {
    calls.add('requestContactCode:$value');
  }

  @override
  Future<void> verifyContact({required ContactType type, required String value, required String code}) async {
    calls.add('verifyContact');
  }
}

/// ProviderScope + MaterialApp wrapper for onboarding widget/golden tests.
Future<Widget Function(Widget)> onboardingWrapper(
  ThemeData theme, {
  CurrentUser? user,
  FakeOnboardingRepository? repo,
  StartupStatus startup = StartupStatus.ready,
  CurrentUserState? userState,
  double textScale = 1,
  List<Override> extra = const [],
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  final l10nDb = L10nDatabase(NativeDatabase.memory());
  addTearDown(l10nDb.close);
  final state = userState ?? (user == null ? const CurrentUserState.idle() : CurrentUserState.ready(user));
  return (Widget child) => ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          l10nDatabaseProvider.overrideWithValue(l10nDb),
          currentUserControllerProvider.overrideWith(() => FixedUserController(state)),
          appStartupProvider.overrideWith(() => FixedStartup(startup)),
          languageCatalogProvider.overrideWith((ref) async => kLanguageCatalog),
          if (repo != null) onboardingRepositoryProvider.overrideWithValue(repo),
          // docs/05: screens that show posts/follows never hit the network.
          ...socialOverrides(),
          ...extra,
        ],
        child: MaterialApp(
          theme: theme,
          debugShowCheckedModeBanner: false,
          home: Builder(
            builder: (context) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
              child: child,
            ),
          ),
        ),
      );
}
