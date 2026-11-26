import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/diagnostics/app_event_names.dart';
import 'package:lawbid/core/diagnostics/app_events.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/sign_out_hooks.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/notifications/application/push_service.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Signs out: the phone forgets the session at once, and the server is told
/// in the background (`POST /auth/logout` and this device's push tokens).
/// AppRouterGuard then sends the user to /welcome — callers never navigate.
/// Used by Settings → Log out and by the back button of the first
/// onboarding step ("back to sign-in").
///
/// R2-A #10 (Instagram / Telegram: a local sign-out at once, the server
/// told in the background): before, the tap waited for three server calls
/// in a row (15 s connect timeout each, plus retries) and seemed to do
/// nothing on a bad network.
Future<void> signOut(WidgetRef ref) async {
  // Owner 2026-10-05 (docs/ops/demo-world.md): inside a demo account «Выйти»
  // leaves the demo — back to the parked real account, or to the welcome
  // screen for a blogger who came in with a code.
  if (ref.read(sessionControllerProvider)?.isDemo ?? false) {
    await ref.read(demoSessionControllerProvider.notifier).exitDemo();
    return;
  }
  AppEvents.track(AppEventNames.logout);
  // Everything the server half needs is taken now: after the local clear
  // the session (and its token) is gone.
  final bearer = await _bearerForSignOut(ref);
  final dio = ref.read(dioProvider);
  // docs/05 §9.5: this device stops getting pushes for the account.
  final tokens = ref.read(pushServiceProvider).detachForSignOut();
  // Steps owned by features (core/session/sign_out_hooks.dart), e.g.
  // item 25: the MLS keys and groups of this device are deleted and the
  // device is signed out on the server (WhatsApp).
  final featureCalls = await SignOutHooks.run(ref);
  await ref.read(sessionControllerProvider.notifier).clear();
  if (bearer != null) {
    unawaited(
      _tellServer(
        dio,
        bearer,
        voip: tokens.voip,
        push: tokens.push,
        featureCalls: featureCalls,
      ),
    );
  }
  // The browser's copies of queued media go with the account.
  try {
    await ref.read(uploadFilesProvider).forgetOnSignOut();
  } catch (_) {
    // Best effort; they are swept after a week anyway.
  }
}

/// The token the server half goes out with. Only a session opened from the
/// phone's copy (no token yet) or with an expired token waits for one
/// refresh; offline, the phone signs out anyway (its refresh token is
/// deleted, so the server session can no longer be used and expires).
Future<String?> _bearerForSignOut(WidgetRef ref) async {
  final s = ref.read(sessionControllerProvider);
  if (s == null) return null;
  final session = ref.read(sessionControllerProvider.notifier);
  try {
    if (s.awaitsRefresh) return await session.accessTokenForRequest();
    if (!s.accessTokenExpiresAt.isAfter(DateTime.now())) {
      return await session.refreshAccessToken();
    }
    return s.accessToken;
  } on Object {
    return null;
  }
}

/// The push tokens first (the logout ends the token they need), then the
/// logout. Each call is repeated on a network failure with the server's
/// retry settings (`client.retry_max`, `client.retry_base_ms`).
Future<void> _tellServer(
  Dio dio,
  String bearer, {
  required String? voip,
  required String? push,
  List<SignOutServerCall> featureCalls = const [],
}) async {
  final extras = <String, dynamic>{
    RequestFlags.bearer: bearer,
    // The loop below repeats the calls; no second layer of retries.
    RequestFlags.noRetry: true,
  };
  final notifications = api.NotificationsClient(dio);
  await Future.wait([
    if (voip != null)
      _repeated(
        () => notifications.deleteVoipToken(
          body: api.DeletePushTokenDto(token: voip),
          extras: extras,
        ),
      ),
    if (push != null)
      _repeated(
        () => notifications.deletePushToken(
          body: api.DeletePushTokenDto(token: push),
          extras: extras,
        ),
      ),
    for (final c in featureCalls) _repeated(() => c(dio, extras)),
  ]);
  await _repeated(() => api.AuthClient(dio).logout(extras: extras));
}

/// Runs [call]; only a failure without an answer (no network, timeout) is
/// tried again, with backoff. Never throws: the server also ends the
/// device's push tokens with the session, and the session itself expires.
Future<void> _repeated(Future<Object?> Function() call) async {
  for (var attempt = 0;; attempt++) {
    try {
      await call();
      return;
    } on DioException catch (e) {
      if (e.response != null || attempt >= ClientTuning.retryMax) return;
      await Future<void>.delayed(ClientTuning.retryBase * (1 << attempt));
    } on Object {
      return;
    }
  }
}
