import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';

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
    try {
      if (Firebase.apps.isEmpty) await Firebase.initializeApp();
    } on Object catch (e) {
      debugPrint('push disabled: $e');
      _startedFor = null;
      return;
    }
    final m = FirebaseMessaging.instance;
    try {
      await m.requestPermission();
      final token = await m.getToken();
      if (token != null) await _register(token);
      _subs
        ..add(m.onTokenRefresh.listen(_register))
        ..add(FirebaseMessaging.onMessageOpenedApp.listen(_open))
        // A push in the foreground: realtime already updated the screen;
        // just refresh the badge.
        ..add(FirebaseMessaging.onMessage.listen(
            (_) => _ref.read(badgesProvider.notifier).refresh()));
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
            ios: defaultTargetPlatform == TargetPlatform.iOS,
          );
    } on Object {
      // Next app start registers again.
    }
  }

  /// Sign-out: this device stops receiving pushes.
  Future<void> unregister() async {
    _startedFor = null;
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
    final route = notificationRoute(
      type: '${data['type'] ?? ''}',
      payload: Map<String, Object?>.from(data),
      attorney: _ref.read(currentUserRoleProvider) == UserRole.attorney,
      myId: _ref.read(currentUserIdProvider),
    );
    if (route != null) unawaited(_ref.read(appRouterProvider).push(route));
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
