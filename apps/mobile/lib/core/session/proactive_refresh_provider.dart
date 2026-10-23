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

  void plan(String token, DateTime fallback) {
    refresher.schedule(jwtExpiry(token) ?? fallback);
  }

  final current = ref.read(sessionControllerProvider);
  if (current != null) {
    plan(current.accessToken, current.accessTokenExpiresAt);
  }
  ref.listen(sessionControllerProvider, (_, s) {
    if (s == null) {
      refresher.clear();
    } else {
      plan(s.accessToken, s.accessTokenExpiresAt);
    }
  });
  final sub = ref.read(appSignalsProvider).signals.listen((s) {
    switch (s) {
      case AppSignal.resumed:
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
