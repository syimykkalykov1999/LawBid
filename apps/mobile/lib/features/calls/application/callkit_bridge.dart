import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// OQ-041: the phone's own incoming-call screen (Android full-screen
/// ringing notification / iOS CallKit) — rings on a locked screen and
/// with the app closed. Every call is wrapped: without the plugin (tests,
/// desktop) nothing happens.
class CallkitSystemUi implements SystemCallUi {
  const CallkitSystemUi();

  @override
  Future<void> showIncoming(AppCall call) => showLawbidIncoming(
        callId: call.id,
        callerName: call.peer.name,
        avatarUrl: call.peer.avatarUrl,
      );

  @override
  Future<void> dismiss(String callId) async {
    try {
      await FlutterCallkitIncoming.endCall(callId);
    } on Object {
      // No plugin / already gone.
    }
  }
}

/// Shows the system ringing UI for [callId] (also from the push
/// background isolate).
Future<void> showLawbidIncoming({
  required String callId,
  required String callerName,
  String? avatarUrl,
}) async {
  try {
    await FlutterCallkitIncoming.showCallkitIncoming(CallKitParams(
      id: callId,
      nameCaller: callerName,
      appName: 'LawBid',
      avatar: avatarUrl,
      handle: 'LawBid',
      // 0 = audio call.
      type: 0,
      duration: 45000,
      extra: {'callId': callId},
      missedCallNotification: const NotificationParams(
        showNotification: false,
      ),
      android: const AndroidParams(
        isCustomNotification: true,
        isShowLogo: false,
        ringtonePath: 'system_ringtone_default',
        backgroundColor: '#0A1A3F',
        actionColor: '#C9A24A',
        textColor: '#ffffff',
        incomingCallNotificationChannelName: 'Incoming calls',
        isShowFullLockedScreen: true,
        textAccept: 'Accept',
        textDecline: 'Decline',
      ),
      ios: const IOSParams(
        handleType: 'generic',
        supportsVideo: false,
        maximumCallGroups: 1,
        maximumCallsPerCallGroup: 1,
        supportsDTMF: false,
        supportsHolding: false,
      ),
    ));
  } on Object catch (e) {
    debugPrint('callkit unavailable: $e');
  }
}

/// FCM in the background / killed app (Android data-only push): ring.
@pragma('vm:entry-point')
Future<void> lawbidBackgroundMessage(RemoteMessage message) async {
  final d = message.data;
  if (d['type'] != 'incoming_call') return;
  final callId = d['callId'];
  if (callId is! String) return;
  await showLawbidIncoming(
    callId: callId,
    callerName: '${d['callerName'] ?? d['title'] ?? 'LawBid'}',
  );
}

/// Answers / declines made on the system UI reach the call controller.
/// Kept alive by `CallHost`.
final callkitEventsProvider = Provider<void>((ref) {
  StreamSubscription<CallEvent?>? sub;
  try {
    sub = FlutterCallkitIncoming.onEvent.listen((event) async {
      final controller = ref.read(callControllerProvider.notifier);
      switch (event) {
        case CallEventActionCallAccept(:final callKitParams):
          await controller.ringFromPush(callKitParams.id, accept: true);
        case CallEventActionCallDecline(:final callKitParams):
          final s = ref.read(callControllerProvider);
          if (s.call?.id == callKitParams.id) {
            await controller.decline();
          } else {
            try {
              await ref.read(callsRepositoryProvider).decline(callKitParams.id);
            } on Object {
              // Already over.
            }
          }
        default:
          break;
      }
    }, onError: (Object _) {});
  } on Object {
    // No plugin.
  }
  // A call accepted on the lock screen before the app started.
  unawaited(() async {
    try {
      final calls = await FlutterCallkitIncoming.activeCalls();
      for (final c in calls) {
        if (c.isAccepted) {
          await ref
              .read(callControllerProvider.notifier)
              .ringFromPush(c.id, accept: true);
        }
      }
    } on Object {
      // No plugin.
    }
  }());
  ref.onDispose(() => sub?.cancel());
});
