import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/realtime/app_signals.dart';
import 'package:lawbid/core/realtime/timings_provider.dart';
import 'package:lawbid/core/session/proactive_refresh.dart';
import 'package:lawbid/core/session/session_providers.dart';

/// Keeps the access token fresh for as long as the user is signed in
/// (Owner 2026-10-23, part C1): renews it ahead of its end, on resume and
/// when the network returns. Listen to it from the signed-in shell.
final proactiveRefresherProvider = Provider<ProactiveTokenRefresher?>((ref) {
  final signedIn =
      ref.watch(sessionControllerProvider.select((s) => s?.sub)) != null;
  if (!signedIn) return null;
  final session = ref.read(sessionControllerProvider.notifier);
  final refresher = ProactiveTokenRefresher(
    refresh: () async {
      await session.refreshAccessToken();
    },
    timings: () => ref.read(realtimeTimingsProvider),
  );

  // S15-3: plan from `accessTokenExpiresAt` = (phone's clock at the moment
  // the answer arrived) + the server's relative `expiresIn`, NOT from the
  // JWT `exp` (server clock) compared with the phone's clock: a phone whose
  // clock is hours off used to refresh every second.
  final current = ref.read(sessionControllerProvider);
  if (current != null) {
    refresher.schedule(current.accessTokenExpiresAt);
  }
  ref.listen(sessionControllerProvider, (_, s) {
    if (s == null) {
      refresher.clear();
    } else {
      refresher.schedule(s.accessTokenExpiresAt);
    }
  });
  final sub = ref.read(appSignalsProvider).signals.listen((s) {
    switch (s) {
      case AppSignal.resumed:
        // S15-6: a refresh token the keystore refused earlier.
        unawaited(session.flushPendingToken());
        unawaited(refresher.ensureFresh());
      case AppSignal.networkBack:
        unawaited(refresher.ensureFresh());
      case AppSignal.paused:
        refresher.pause();
    }
  });
  ref.onDispose(() {
    unawaited(sub.cancel());
    refresher.dispose();
  });
  return refresher;
});
