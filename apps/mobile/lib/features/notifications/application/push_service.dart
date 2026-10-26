import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/web_push_config.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/permissions/permission_primer.dart';
import 'package:lawbid/core/platform/chat_notifications_channel.dart';
import 'package:lawbid/core/realtime/app_signals.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/chat/application/chat_media_outbox.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/notifications/application/data_push_sync_hook.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/application/push_registrar.dart';
import 'package:lawbid/features/notifications/application/system_notifications.dart';
import 'package:lawbid/features/notifications/application/task_reminder_scheduler.dart';
import 'package:lawbid/features/notifications/application/task_reminders.dart';
import 'package:lawbid/features/notifications/application/timezone_sync.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// docs/05 §9.5 push on the device: FCM token registered for this session
/// (`POST /push-tokens`), re-registered when it rotates, removed on
/// sign-out; tapping a push opens its screen. Without Firebase config
/// files (dev builds, docs/KEYS_SETUP.md) this quietly does nothing.
class PushService {
  PushService(this._ref);

  final Ref _ref;
  PushRegistrar? _registrar;

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
    _registrar?.stop();
    final registrar = _registrar = _newRegistrar(user);
    // S15-7: once a week (on resume) the token is registered again.
    try {
      _subs.add(
        _ref.read(appSignalsProvider).signals.listen((s) {
          if (s == AppSignal.resumed) unawaited(registrar.onResume());
        }),
      );
    } on Object catch (e) {
      debugPrint('push: no resume signal: $e');
    }
    // docs/01 §11 Шаг 3: the onboarding explainer asked first; a user who
    // said no there is not prompted by the OS at every start (Settings →
    // Notifications re-asks explicitly).
    final optIn = _ref
        .read(currentUserControllerProvider)
        .user
        ?.onboarding
        .data['pushOptIn'];
    // Push 2026-10-19: a «no» there only means no system prompt — the
    // device is still registered (no dialog needed for that), so calls ring
    // and pushes show once the person allows them in the phone's settings.
    final prompt = optIn != false;
    if (!prompt) debugPrint('push: declined in onboarding, not prompting');
    // Owner 2026-10-22 (audit #13): the phone's dialogs come after a short
    // explanation (core/permissions/permission_primer.dart), asked below
    // once Firebase is up — or without it when this build has none.
    // Owner 2026-10-22: a chat notification the app draws itself (Android)
    // opens its chat, also when it started the app.
    _subs.add(chatNotificationsChannel.opens.listen(_openData));
    unawaited(
      chatNotificationsChannel.takeLaunchOpen().then((data) {
        if (data != null) _openData(data);
      }),
    );
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
    // The browser's token request is itself the permission prompt.
    if (kIsWeb && !prompt) return;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: kIsWeb ? WebPushConfig.options : null,
        );
      }
    } on Object catch (e) {
      debugPrint('push disabled: $e');
      if (prompt && !kIsWeb) unawaited(_explainThenAsk(null));
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
      if (prompt) {
        // The browser: the token request is the prompt, as before.
        if (kIsWeb) {
          await m.requestPermission();
        } else {
          unawaited(_explainThenAsk(m));
        }
      }
      final token = await m.getToken(
        vapidKey: kIsWeb ? WebPushConfig.vapidKey : null,
      );
      // Not awaited: a failed registration keeps retrying in the background.
      if (token != null) unawaited(_register(token));
      _subs
        ..add(m.onTokenRefresh.listen(_register))
        ..add(FirebaseMessaging.onMessageOpenedApp.listen(_open))
        // A push in the foreground: realtime already updated the screen;
        // just refresh the badge.
        ..add(
          FirebaseMessaging.onMessage.listen((msg) {
            // Owner 2026-10-20: a planner reminder (data-only on devices that
            // keep their own alarms) is drawn here, under the task's id.
            if (msg.data['type'] == taskReminderType) {
              unawaited(showTaskReminderFromPush(msg.data));
              _ref.read(badgesProvider.notifier).refresh();
              return;
            }
            // OQ-041: the socket may have missed the ring.
            // Push 2026-10-19: the call is over — stop the system ringing
            // (realtime updates the in-app screen).
            if (msg.data['type'] == 'call_ended' &&
                msg.data['callId'] is String) {
              final id = msg.data['callId'] as String;
              if (msg.data['ended'] == '1') {
                // The answered call is over: re-read it, close the call.
                unawaited(
                  _ref.read(callControllerProvider.notifier).remoteEnded(id),
                );
              } else {
                unawaited(stopLawbidIncoming(id));
              }
              return;
            }
            if (msg.data['type'] == 'group_call') {
              _showCallInvite(msg.data);
              return;
            }
            if (msg.data['type'] == 'incoming_call' &&
                msg.data['callId'] is String) {
              unawaited(
                _ref
                    .read(callControllerProvider.notifier)
                    .ringFromPush(msg.data['callId'] as String),
              );
              return;
            }
            // S15-8: the trigger of a "go and fetch" sync (a stub until the
            // changes-since endpoint exists).
            unawaited(
              _ref
                  .read(dataPushSyncHookProvider)(msg.data)
                  .catchError((Object _) {}),
            );
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

  /// Owner 2026-10-22 (audit #13): a short explanation first, then the
  /// phone's notification dialogs; on the iPhone the microphone right after
  /// (same card, second step) — a call answered on the CallKit sheet must
  /// already have it (PR #236). Android asks the microphone at the first
  /// call instead (callMicPermissionProvider).
  Future<void> _explainThenAsk(FirebaseMessaging? m) async {
    final ios = defaultTargetPlatform == TargetPlatform.iOS;
    try {
      await _ref.read(permissionPrimerProvider.notifier).onboard(
            notifications: () async {
              await _askSystemPermissions();
              if (m != null) await m.requestPermission();
            },
            microphone: ios
                ? () async {
                    await _ref.read(callMicPermissionProvider)();
                  }
                : null,
          );
    } on Object catch (e) {
      debugPrint('permission ask failed: $e');
    }
  }

  /// Notifications, then (Android 14+) the «full-screen notifications»
  /// switch an incoming call needs to cover the lock screen like a phone
  /// call — asked once per install (the system's own settings page).
  Future<void> _askSystemPermissions() async {
    final allowed = await _ref.read(systemNotificationsProvider).request();
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
    if (!allowed) return;
    try {
      if (await FlutterCallkitIncoming.canUseFullScreenIntent()) return;
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_fullScreenAskedKey) ?? false) return;
      await prefs.setBool(_fullScreenAskedKey, true);
      await FlutterCallkitIncoming.requestFullIntentPermission();
    } on Object catch (e) {
      debugPrint('full-screen intent check failed: $e');
    }
  }

  static const _fullScreenAskedKey = 'push.fullScreenIntentAsked';

  /// S15-7: retry with backoff + a 7-day re-register (push_registrar.dart).
  PushRegistrar _newRegistrar(String user) => PushRegistrar(
        send: _post,
        readLastRegisteredMs: () async {
          try {
            final prefs = await SharedPreferences.getInstance();
            return prefs.getInt('push.registeredAt.$user');
          } on Object {
            return null;
          }
        },
        writeLastRegisteredMs: (ms) async {
          try {
            final prefs = await SharedPreferences.getInstance();
            await prefs.setInt('push.registeredAt.$user', ms);
          } on Object {
            // Only the 7-day reminder suffers.
          }
        },
        currentToken: () async => Firebase.apps.isEmpty
            ? null
            : FirebaseMessaging.instance.getToken(
                vapidKey: kIsWeb ? WebPushConfig.vapidKey : null,
              ),
      );

  Future<void> _register(String token) {
    final registrar = _registrar;
    if (registrar == null) return _post(token).catchError((Object _) {});
    return registrar.register(token);
  }

  Future<void> _post(String token) =>
      _ref.read(notificationsRepositoryProvider).registerPushToken(
            token,
            ios: !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS,
            web: kIsWeb,
            // Owner 2026-10-20: this app arms the planner reminders itself.
            localReminders: TaskReminderScheduler.supported,
            // Owner 2026-10-22: Android draws chat pushes itself (sender's
            // photo, one notification per chat).
            chatStyle:
                !kIsWeb && defaultTargetPlatform == TargetPlatform.android,
          );

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
              // Release builds (TestFlight / App Store) get production
              // tokens, debug builds sandbox ones; the server retries the
              // other gateway once and remembers it if this guess is off.
              production: kReleaseMode,
            );
        _voipToken = token;
      } on Object {
        // Next app start registers again.
      }
    }

    // One shared subscription for the whole app (callkitEvents): a second
    // direct listener would take the channel from the call controller.
    _subs.add(
      callkitEvents().listen(
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
    // Owner 2026-10-22: no chat of this account stays in the shade.
    unawaited(chatNotificationsChannel.clearAll());
    final voip = _voipToken;
    _voipToken = null;
    if (voip != null) {
      try {
        await _ref.read(notificationsRepositoryProvider).deleteVoipToken(voip);
      } on Object {
        // The server also drops tokens of signed-out sessions.
      }
    }
    final token = _registrar?.token;
    _registrar?.stop();
    _registrar = null;
    if (token == null) return;
    try {
      await _ref.read(notificationsRepositoryProvider).deletePushToken(token);
    } on Object {
      // The server also drops tokens of signed-out sessions.
    }
  }

  /// A call from a group chat: a light prompt in the app, not a ring.
  void _showCallInvite(Map<String, dynamic> data) {
    final id = data['callId'];
    if (id is! String) return;
    final gid = data['groupId'];
    _ref.read(callInviteProvider.notifier).set(
          CallInvite(
            callId: id,
            groupId: gid is String && gid.isNotEmpty ? gid : null,
            who: '${data['callerName'] ?? ''}',
            title: '${data['groupTitle'] ?? ''}',
            video: data['video'] == '1',
          ),
        );
  }

  void _open(RemoteMessage message) => _openData(message.data);

  void _openData(Map<String, dynamic> data) {
    if (data['type'] == 'group_call') _showCallInvite(data);
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
  // Owner 2026-10-20: the phone's time zone and the planner's reminder
  // alarms follow the session.
  ref
    ..watch(timezoneSyncProvider)
    ..watch(taskReminderSyncProvider);
  Future.microtask(() {
    ref.read(pushServiceProvider).start();
    ref.read(outboxSenderProvider).drain();
    // Owner 2026-10-22 (audit #4 §3): queued voice notes, photos, files
    // and stickers left from the last run go out.
    ref.read(chatMediaOutboxProvider).drain();
    ref.read(deliveryAckerProvider);
  });
});
