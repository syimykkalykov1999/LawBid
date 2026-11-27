import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/realtime/app_signals.dart';
import 'package:lawbid/core/realtime/timings_provider.dart';
import 'package:lawbid/core/session/proactive_refresh_provider.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/uploads/file_ready.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_providers.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_providers.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_service.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

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
    // Perf batch 4 (row 127): a session opened from the phone's copy has
    // no token until its background refresh lands; the socket waits for it.
    token: () async {
      try {
        return await session.accessTokenForRequest();
      } on Object {
        return null;
      }
    },
    refreshToken: () async {
      try {
        return await session.refreshAccessToken();
      } on Object {
        return null;
      }
    },
    timings: () => ref.read(realtimeTimingsProvider),
    // The same catch-up as `sync:since`, over HTTP, when the socket is mute.
    fetchMissed: (since) async {
      final r = await ref.read(dioProvider).get<Map<String, dynamic>>(
        '/realtime/missed',
        queryParameters: {'since': since},
      );
      final data = r.data?['data'];
      return data is Map ? Map<String, Object?>.from(data) : null;
    },
    // Owner 2026-10-23: coming back to the app renews a token that is about
    // to end BEFORE the socket reconnects with it.
    ensureFreshToken: () async =>
        ref.read(proactiveRefresherProvider)?.ensureFresh(),
    // Item 25: `mls` messages are opened on the device before any screen
    // sees them; the encryption group follows the server's commits.
    transform: (name, data) => openE2eeEvent(
      ref.read(e2eeServiceProvider),
      name,
      data,
      groups: ref.read(groupE2eeServiceProvider),
    ),
  );
  // Owner 2026-10-23 (part C9): background / foreground / network back.
  final reachability = ref.read(reachabilitySignalProvider);
  final signals = ref.read(appSignalsProvider).signals.listen((s) {
    switch (s) {
      case AppSignal.paused:
        reachability.setBackground(true);
        client.pause();
      case AppSignal.resumed:
        reachability.setBackground(false);
        client.resume();
      case AppSignal.networkBack:
        client.networkBack();
    }
  });
  // Owner row 106: `file:ready` reaches the uploader (core/uploads).
  FileReady.connected = () => client.connected;
  final ready = client.events.listen((e) {
    if (e.name != 'file:ready') return;
    final d = e.data;
    final id = d is Map ? d['fileId'] : null;
    if (id is String) FileReady.add(id);
  });
  ref
    ..listen(sessionControllerProvider.select((s) => s?.accessToken),
        (_, token) {
      if (token != null && token.isNotEmpty) client.tokenChanged(token);
    })
    ..onDispose(() {
      signals.cancel();
      unawaited(ready.cancel());
      FileReady.reset();
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

/// Item 25: a realtime event as the screens read it — the message of
/// `message:new` / `message:updated` opened when it is end-to-end
/// encrypted; `e2ee:commit` / `e2ee:welcome` bring the chat's group up to
/// date.
Future<Object?> openE2eeEvent(
  E2eeService? e2ee,
  String name,
  Object? data, {
  GroupE2eeService? groups,
}) async {
  if (e2ee == null || data is! Map) return data;
  // G2: the group scope of the same Delivery Service (G1 sends
  // `e2ee:group` / `e2ee:group_welcome` with the group's id).
  if (name == 'e2ee:group' || name == 'e2ee:group_welcome') {
    final group = data['groupId'];
    if (group is String) groups?.onServerEvent(group);
    return data;
  }
  if (name == 'e2ee:commit' || name == 'e2ee:welcome') {
    final id = data['conversationId'];
    if (id is String) e2ee.onServerEvent(id);
    return data;
  }
  if (name != 'message:new' && name != 'message:updated') return data;
  final m = data['message'];
  if (m is! Map || m['type'] != 'mls') return data;
  final dto = api.MessageDto.fromJson(Map<String, dynamic>.from(m));
  final opened = await e2ee.open(dto);
  return {...data, 'message': opened.toJson()};
}
