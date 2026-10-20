import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_end_port_stub.dart'
    if (dart.library.io) 'package:lawbid/features/calls/application/call_end_port_io.dart';
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
        video: call.video,
      );

  @override
  Future<void> dismiss(String callId) async {
    try {
      await FlutterCallkitIncoming.endCall(callId);
    } on Object {
      // No plugin / already gone.
    }
  }

  @override
  Future<void> answered(AppCall call) async {
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      // Answered on the CallKit screen: keep that call (green bar in the
      // status bar, audio session kept by the system, e.g. when screen
      // recording starts) and end it only when the call ends.
      try {
        final calls = await FlutterCallkitIncoming.activeCalls();
        if (calls.any((c) => c.id == call.id && c.isAccepted)) return;
        if (calls.any((c) => c.id == call.id)) {
          // A ringing one: replace it with a connected call.
          _ignoreEnded(call.id);
          await dismiss(call.id);
        }
      } on Object {
        // No plugin: fall through.
      }
      await showOngoing(call);
      return;
    }
    // Android: the ringing screen goes; the app's own ongoing-call
    // notification (CallForegroundService) is started by the controller.
    await dismiss(call.id);
  }

  @override
  Future<void> showOngoing(AppCall call) async {
    // Owner 2026-10-20: an in-app answer / outgoing call is registered with
    // CallKit too — the system's green call pill, tap → the app.
    // (Android has its own foreground-service notification instead.)
    if (defaultTargetPlatform != TargetPlatform.iOS) return;
    try {
      final calls = await FlutterCallkitIncoming.activeCalls();
      if (calls.any((c) => c.id == call.id)) return;
      await FlutterCallkitIncoming.startCall(
        CallKitParams(
          id: call.id,
          nameCaller: call.peer.name,
          appName: 'LawBid',
          avatar: call.peer.avatarUrl,
          handle: call.peer.name.isEmpty ? 'LawBid' : call.peer.name,
          type: 0,
          extra: {'callId': call.id},
          ios: const IOSParams(
            handleType: 'generic',
            supportsVideo: false,
            maximumCallGroups: 1,
            maximumCallsPerCallGroup: 1,
            supportsDTMF: false,
            supportsHolding: false,
          ),
        ),
      );
    } on Object catch (e) {
      debugPrint('callkit ongoing unavailable: $e');
    }
  }
}

/// CallKit ids we ended ourselves a moment ago: their "ended" event is not
/// the user hanging up.
final _ignoredEnded = <String, DateTime>{};

void _ignoreEnded(String id) {
  _ignoredEnded[id] = DateTime.now().add(const Duration(seconds: 4));
}

bool _endedByUs(String id) {
  final until = _ignoredEnded[id];
  return until != null && DateTime.now().isBefore(until);
}

/// Shows the system ringing UI for [callId] (also from the push
/// background isolate).
Future<void> showLawbidIncoming({
  required String callId,
  required String callerName,
  String? avatarUrl,
  // Owner 2026-10-02: "Calls" off in Settings → the call shows, silently.
  bool silent = false,
  // Owner 2026-10-05: the system screen says "video call".
  bool video = false,
}) async {
  try {
    await FlutterCallkitIncoming.showCallkitIncoming(
      CallKitParams(
        id: callId,
        nameCaller: callerName,
        appName: 'LawBid',
        avatar: avatarUrl,
        handle: 'LawBid',
        // 0 = audio call, 1 = video call. Android always rings as audio: the
        // call service has no camera foreground-service type (video calls off).
        type: video && defaultTargetPlatform != TargetPlatform.android ? 1 : 0,
        duration: 60000,
        extra: {'callId': callId},
        missedCallNotification: const NotificationParams(
          showNotification: false,
        ),
        android: AndroidParams(
          isCustomNotification: true,
          isShowLogo: false,
          // res/raw/silence.wav when calls are switched off; otherwise
          // the phone's own ringtone (owner 2026-10-07).
          ringtonePath: silent ? 'silence' : 'system_ringtone_default',
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
      ),
    );
  } on Object catch (e) {
    debugPrint('callkit unavailable: $e');
  }
}

/// Push 2026-10-19 (`call_ended` push): the caller hung up, the call was
/// missed or answered elsewhere — the system ringing screen goes away,
/// unless this phone is the one that answered it.
///
/// [over] (owner 2026-10-20): the ANSWERED call is over too — end the
/// system call even if this phone had accepted it.
Future<void> stopLawbidIncoming(String callId, {bool over = false}) async {
  try {
    final calls = await FlutterCallkitIncoming.activeCalls();
    final mine = calls.where((c) => c.id == callId);
    if (mine.isEmpty || (!over && mine.any((c) => c.isAccepted))) return;
    await FlutterCallkitIncoming.endCall(callId);
  } on Object catch (e) {
    debugPrint('callkit unavailable: $e');
  }
}

/// FCM in the background / killed app (Android data-only push): ring, or
/// stop ringing when the call is over.
@pragma('vm:entry-point')
Future<void> lawbidBackgroundMessage(RemoteMessage message) async {
  final d = message.data;
  final callId = d['callId'];
  if (callId is! String) return;
  if (d['type'] == 'call_ended') {
    final over = d['ended'] == '1';
    // The app's own isolate (alive in the background while a call runs)
    // holds the call: tell it to re-read the call from the server now.
    if (over && sendCallEnded(callId)) return;
    await stopLawbidIncoming(callId, over: over);
    return;
  }
  if (d['type'] != 'incoming_call') return;
  await showLawbidIncoming(
    callId: callId,
    callerName: '${d['callerName'] ?? d['title'] ?? 'LawBid'}',
    silent: d['silent'] == '1',
    video: d['video'] == '1',
  );
}

/// Answers / declines made on the system UI reach the call controller.
/// Kept alive by `CallHost`.
final callkitEventsProvider = Provider<void>((ref) {
  // Web: no system call UI; calls ring in the open tab only.
  if (kIsWeb) return;
  // Owner 2026-10-11: no own permission dialog at app start — the system's
  // notification request comes once after sign-in (PushService), and it
  // also lets incoming calls ring.
  StreamSubscription<CallEvent?>? sub;
  try {
    sub = FlutterCallkitIncoming.onEvent.listen(
      (event) async {
        final controller = ref.read(callControllerProvider.notifier);
        switch (event) {
          case CallEventActionCallAccept(:final callKitParams):
            await controller.ringFromPush(callKitParams.id, accept: true);
          case CallEventActionCallEnded(:final callKitParams):
            // iOS: "End" on the system call UI (the green pill / lock
            // screen) hangs up. Our own endCall() also reports it — the
            // call is already over then.
            final s = ref.read(callControllerProvider);
            if (!_endedByUs(callKitParams.id) &&
                s.busy &&
                s.call?.id == callKitParams.id &&
                s.phase != CallPhase.incoming) {
              await controller.hangUp();
            }
          case CallEventActionCallDecline(:final callKitParams):
            final s = ref.read(callControllerProvider);
            if (s.call?.id == callKitParams.id) {
              await controller.decline();
            } else {
              try {
                await ref
                    .read(callsRepositoryProvider)
                    .decline(callKitParams.id);
              } on Object {
                // Already over.
              }
            }
          default:
            break;
        }
      },
      onError: (Object _) {},
    );
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
  // "Call over" pushes caught by the background isolate (Android, app
  // minimised): the controller asks the server and closes everything.
  final stopEnded = listenCallEnded((id) {
    unawaited(ref.read(callControllerProvider.notifier).remoteEnded(id));
  });
  ref.onDispose(() {
    sub?.cancel();
    stopEnded();
  });
});
