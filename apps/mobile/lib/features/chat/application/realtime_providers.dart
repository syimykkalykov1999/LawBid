import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';

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
  );
  ref
    ..listen(sessionControllerProvider.select((s) => s?.accessToken),
        (_, token) {
      if (token != null) client.tokenChanged(token);
    })
    ..onDispose(client.dispose);
  client.connect();
  return client;
});

/// Every realtime event; empty while signed out.
final realtimeEventsProvider = Provider<Stream<RealtimeEvent>>(
  (ref) =>
      ref.watch(realtimeClientProvider)?.events ??
      const Stream<RealtimeEvent>.empty(),
);
