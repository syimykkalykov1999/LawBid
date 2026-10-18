import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show appFlavor;
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/web_push_config.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/application/system_notifications.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// docs/05 §9.5 push on the device: FCM token registered for this session
/// (`POST /push-tokens`), re-registered when it rotates, removed on
/// sign-out; tapping a push opens its screen. Without Firebase config
/// files (dev builds, docs/KEYS_SETUP.md) this quietly does nothing.
class PushService {
  PushService(this._ref);

  final Ref _ref;
  String? _token;

  /// The user this device is registered for; a different sign-in
  /// registers again (review: user B after user A got no pushes).
  String? _startedFor;
  final _subs = <StreamSubscription<Object?>>[];

  Future<void> start() async {
    final user = _ref.read(currentUserIdProvider);
    if (user == null || _startedFor == user) return;
    _startedFor = user;
    for (final s in _subs) {
      await s.cancel();
    }
    _subs.clear();
    // docs/01 §11 Шаг 3: the onboarding explainer asked first; a user who
    // said no there is not prompted by the OS at every start (Settings →
    // Notifications re-asks explicitly).
    final optIn = _ref
        .read(currentUserControllerProvider)
        .user
        ?.onboarding
        .data['pushOptIn'];
    if (optIn == false) {
      debugPrint('push: declined in onboarding, not prompting');
      return;
    }
    // Owner 2026-10-15: the phone's permission is asked here, whether or not
    // the push SDK is set up in this build.
    unawaited(_ref.read(systemNotificationsProvider).request());
    // Owner 2026-10-17: iPhones ring for calls through Apple's VoIP pushes
    // (independent of Firebase).
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS) {
      unawaited(_registerVoip());
    }
    // Web: push only when the build carries the Firebase web app's keys.
    if (kIsWeb && !WebPushConfig.configured) {
      debugPrint('push: no web keys in this build');
      _startedFor = null;
      return;
    }
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: kIsWeb ? WebPushConfig.options : null,
        );
      }
    } on Object catch (e) {
      debugPrint('push disabled: $e');
      _startedFor = null;
      return;
    }
    final m = FirebaseMessaging.instance;
    try {
      // OQ-041: a call pushed while the app is in the background rings
      // through the system call screen.
      if (!kIsWeb) {
        FirebaseMessaging.onBackgroundMessage(lawbidBackgroundMessage);
      }
      await m.requestPermission();
      final token = await m.getToken(
        vapidKey: kIsWeb ? WebPushConfig.vapidKey : null,
      );
      if (token != null) await _register(token);
      _subs
        ..add(m.onTokenRefresh.listen(_register))
        ..add(FirebaseMessaging.onMessageOpenedApp.listen(_open))
        // A push in the foreground: realtime already updated the screen;
        // just refresh the badge.
        ..add(
          FirebaseMessaging.onMessage.listen((msg) {
            // OQ-041: the socket may have missed the ring.
            if (msg.data['type'] == 'incoming_call' &&
                msg.data['callId'] is String) {
              unawaited(
                _ref
                    .read(callControllerProvider.notifier)
                    .ringFromPush(msg.data['callId'] as String),
              );
              return;
            }
            _ref.read(badgesProvider.notifier).refresh();
          }),
        );
      final initial = await m.getInitialMessage();
      if (initial != null) _open(initial);
    } on Object catch (e) {
      debugPrint('push setup failed: $e');
      _startedFor = null; // try again on the next shell start
    }
  }

  Future<void> _register(String token) async {
    _token = token;
    try {
      await _ref.read(notificationsRepositoryProvider).registerPushToken(
            token,
            ios: !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS,
            web: kIsWeb,
          );
    } on Object {
      // Next app start registers again.
    }
  }

  String? _voipToken;

  /// Owner 2026-10-17: the PushKit token (AppDelegate.swift hands it to
  /// the CallKit plugin) goes to the server; again whenever iOS renews it.
  Future<void> _registerVoip() async {
    Future<void> send() async {
      try {
        final token = await FlutterCallkitIncoming.getDevicePushTokenVoIP();
        if (token is! String || token.isEmpty || token == _voipToken) return;
        final info = await PackageInfo.fromPlatform();
        await _ref.read(notificationsRepositoryProvider).registerVoipToken(
              token,
              bundleId: info.packageName,
              // Store builds (prod flavor) talk to Apple's production
              // gateway; the server retries the other one if needed.
              production: appFlavor == 'prod',
            );
        _voipToken = token;
      } on Object {
        // Next app start registers again.
      }
    }

    _subs.add(
      FlutterCallkitIncoming.onEvent.listen(
        (e) {
          if (e is CallEventActionDidUpdateDevicePushTokenVoip) {
            unawaited(send());
          }
        },
        onError: (Object _) {},
      ),
    );
    await send();
  }

  /// Sign-out: this device stops receiving pushes.
  Future<void> unregister() async {
    _startedFor = null;
    final voip = _voipToken;
    _voipToken = null;
    if (voip != null) {
      try {
        await _ref
            .read(notificationsRepositoryProvider)
            .deleteVoipToken(voip);
      } on Object {
        // The server also drops tokens of signed-out sessions.
      }
    }
    final token = _token;
    if (token == null) return;
    try {
      await _ref.read(notificationsRepositoryProvider).deletePushToken(token);
    } on Object {
      // The server also drops tokens of signed-out sessions.
    }
  }

  void _open(RemoteMessage message) {
    final data = message.data;
    if (data['type'] == 'incoming_call' && data['callId'] is String) {
      unawaited(
        _ref
            .read(callControllerProvider.notifier)
            .ringFromPush(data['callId'] as String),
      );
      return;
    }
    // Audit 2026-10-04: opening a push reads its notification.
    final id = data['notificationId'];
    if (id is String) unawaited(_markRead(id));
    final route = notificationRoute(
      type: '${data['type'] ?? ''}',
      payload: Map<String, Object?>.from(data),
      attorney: _ref.read(currentUserRoleProvider) == UserRole.attorney,
      myId: _ref.read(currentUserIdProvider),
    );
    if (route != null) unawaited(_ref.read(appRouterProvider).push(route));
  }

  Future<void> _markRead(String id) async {
    try {
      await _ref.read(notificationsRepositoryProvider).markRead(ids: [id]);
      _ref.invalidate(notificationsProvider);
    } on Object {
      // The row stays unread; a tap in the list reads it.
    }
    unawaited(_ref.read(badgesProvider.notifier).refresh());
  }

  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
  }
}

final pushServiceProvider = Provider<PushService>((ref) {
  final service = PushService(ref);
  ref.onDispose(service.dispose);
  return service;
});

/// Per sign-in start-up work: push registration and the outbox drain.
/// Re-runs when the user changes (MainShell listens to it, so it never
/// runs from a widget's build).
final sessionServicesProvider = Provider<void>((ref) {
  final user = ref.watch(currentUserIdProvider);
  if (user == null) return;
  Future.microtask(() {
    ref.read(pushServiceProvider).start();
    ref.read(outboxSenderProvider).drain();
  });
});
