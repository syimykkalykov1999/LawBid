import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/app_update/app_update_gate.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// FeatureFlagsController pinned to a given `app_config` (as if
/// `/config/bootstrap` had returned it).
class FixedFlags extends FeatureFlagsController {
  FixedFlags(this.appConfig);

  final Map<String, String> appConfig;

  @override
  FeatureFlagsState build() => FeatureFlagsState(flags: defaultFeatureFlags, appConfig: appConfig);

  @override
  Future<void> refreshInBackground() async {}
}

class SignedInSession extends SessionController {
  @override
  SessionState? build() => SessionState(
    accessToken: 'at',
    sub: 'user-1',
    role: 'client',
    sid: 's1',
    verified: false,
    subscriptionStatus: 'none',
    accessTokenExpiresAt: DateTime.utc(2030),
  );
}

class ReadyStartup extends AppStartupController {
  @override
  StartupStatus build() => StartupStatus.ready;
}

/// Base overrides every app_update test needs (prefs, in-memory l10n DB).
Future<List<Override>> baseOverrides({
  Map<String, String> appConfig = const {},
  Map<String, Object> prefs = const {},
  bool signedIn = false,
}) async {
  // Each test builds its own in-memory L10nDatabase on purpose.
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  final l10nDb = L10nDatabase(NativeDatabase.memory());
  addTearDown(l10nDb.close);
  return [
    sharedPreferencesProvider.overrideWithValue(sp),
    l10nDatabaseProvider.overrideWithValue(l10nDb),
    featureFlagsControllerProvider.overrideWith(() => FixedFlags(appConfig)),
    appStartupProvider.overrideWith(ReadyStartup.new),
    if (signedIn) sessionControllerProvider.overrideWith(SignedInSession.new),
  ];
}

/// The real app wiring of the gate: MaterialApp.builder → AppUpdateGate.
Widget gatedApp(ProviderContainer container, {Widget? home}) => UncontrolledProviderScope(
  container: container,
  child: MaterialApp(
    theme: AppTheme.light(),
    builder: (context, child) => AppUpdateGate(child: child),
    home: home ?? const Scaffold(body: Text('HOME')),
  ),
);
