import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/core/startup/app_startup.dart';

/// S16-1: `runLawBid` primes the start-up before `runApp`; the splash joins
/// that run once instead of starting a second one, and a later visit to the
/// splash (demo switch, sign-out) runs again.
class _Session extends SessionController {
  int bootstraps = 0;

  @override
  SessionState? build() => null;

  @override
  Future<SessionBootstrapResult> bootstrap() async {
    bootstraps++;
    return SessionBootstrapResult.signedOut;
  }
}

class _Flags extends FeatureFlagsController {
  @override
  FeatureFlagsState build() =>
      const FeatureFlagsState(flags: defaultFeatureFlags, appConfig: {});

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
}

class _L10n extends L10nCacheController {
  // The real build() listens to the language and, on a change, seeds and
  // reads the drift cache in the background; that unawaited chain can still
  // be writing when the teardown closes the database. This fake never
  // touches the cache, so nothing is left running (same fix as
  // app_startup_test.dart).
  @override
  L10nCacheState build() => const L10nCacheState();

  @override
  Future<void> refreshInBackground() async {}
}

void main() {
  late _Session session;

  ProviderContainer make() {
    session = _Session();
    final c = ProviderContainer(
      overrides: [
        sessionControllerProvider.overrideWith(() => session),
        featureFlagsControllerProvider.overrideWith(_Flags.new),
        l10nCacheControllerProvider.overrideWith(_L10n.new),
        startupL10nDelayProvider
            .overrideWithValue(const Duration(milliseconds: 5)),
      ],
    );
    addTearDown(c.dispose);
    return c;
  }

  test('the splash joins the primed run: one bootstrap', () async {
    final c = make();
    final startup = c.read(appStartupProvider.notifier);
    final primed = startup.prime();
    await startup.start();
    await primed;
    expect(session.bootstraps, 1);
    expect(c.read(appStartupProvider), StartupStatus.ready);
  });

  test('without a primed run the splash starts one; a second visit reruns',
      () async {
    final c = make();
    final startup = c.read(appStartupProvider.notifier);
    await startup.start();
    expect(session.bootstraps, 1);
    await startup.start();
    expect(session.bootstraps, 2);
  });

  test('a primed run is joined once only', () async {
    final c = make();
    final startup = c.read(appStartupProvider.notifier);
    await startup.prime();
    await startup.start();
    expect(session.bootstraps, 1);
    await startup.start();
    expect(session.bootstraps, 2);
  });
}
