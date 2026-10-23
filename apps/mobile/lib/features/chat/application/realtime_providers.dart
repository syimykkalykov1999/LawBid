import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/realtime/app_signals.dart';
import 'package:lawbid/core/realtime/timings_provider.dart';
import 'package:lawbid/core/session/proactive_refresh_provider.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';

// Owner 2026-10-22: other features read the event type from here, not from
// chat's data layer (test/architecture/feature_boundaries_test.dart).
export 'package:lawbid/features/chat/data/realtime_client.dart'
    show RealtimeEvent;

/// The `/realtime` socket for the signed-in session (docs/05 §8.5):
/// created on sign-in, closed on sign-out; a rotated access token is
/// re-checked on the live socket (`auth:refresh`).
final realtimeClientProvider = Provider<RealtimeClient?>((ref) {
  final signedIn =
      ref.watch(sessionControllerProvider.select((s) => s?.sub)) != null;
  if (!signedIn) return null;
  final session = ref.read(sessionControllerProvider.notifier);
  final client = RealtimeClient(
    apiBaseUrl: ref.watch(appEnvironmentProvider).apiBaseUrl,
    token: () async => ref.read(sessionControllerProvider)?.accessToken,
    refreshToken: () async {
      try {
        return await session.refreshAccessToken();
      } on Object {
        return null;
      }
    },
    timings: () => ref.read(realtimeTimingsProvider),
    // Owner 2026-10-23: coming back to the app renews a token that is about
    // to end BEFORE the socket reconnects with it.
    ensureFreshToken: () async =>
        ref.read(proactiveRefresherProvider)?.ensureFresh(),
  );
  // Owner 2026-10-23 (part C9): background / foreground / network back.
  final signals = ref.read(appSignalsProvider).signals.listen((s) {
    switch (s) {
      case AppSignal.paused:
        client.pause();
      case AppSignal.resumed:
        client.resume();
      case AppSignal.networkBack:
        client.networkBack();
    }
  });
  ref
    ..listen(sessionControllerProvider.select((s) => s?.accessToken),
        (_, token) {
      if (token != null) client.tokenChanged(token);
    })
    ..onDispose(() {
      signals.cancel();
      client.dispose();
    });
  client.connect();
  return client;
});

/// Every realtime event; empty while signed out.
final realtimeEventsProvider = Provider<Stream<RealtimeEvent>>(
  (ref) =>
      ref.watch(realtimeClientProvider)?.events ??
      const Stream<RealtimeEvent>.empty(),
);
