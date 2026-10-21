import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_end_port_stub.dart'
    if (dart.library.io) 'package:lawbid/features/calls/application/call_end_port_io.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/notifications/application/task_reminder_scheduler.dart';
import 'package:shared_preferences/shared_preferences.dart';

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
    // The plugin reports our own endCall back as an "ended" / "declined"
    // event: that is not the user hanging up (Android: answering from the
    // heads-up ended the call it had just answered).
    _ignoreEnded(callId);
    try {
      await FlutterCallkitIncoming.endCall(callId);
    } on Object {
      // No plugin / already gone.
    }
  }

  @override
  Future<void> endAll() async {
    // Android's plugin keeps only the last call and its notification: after
    // a call, nothing of ours may stay in the shade (device test
    // 2026-10-20: ghosts of finished calls). A call that rings now is
    // impossible — one call at a time, the server declines the other.
    if (defaultTargetPlatform != TargetPlatform.android) return;
    try {
      await FlutterCallkitIncoming.endAllCalls();
    } on Object {
      // No plugin.
    }
    // The plugin's own notifications can outlive its calls (a ghost whose
    // call it no longer knows): sweep what is left of ours in the shade.
    try {
      await const MethodChannel('lawbid/call_service')
          .invokeMethod<void>('clear');
    } on Object {
      // Not Android / no host.
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
          type: call.video ? 1 : 0,
          extra: {'callId': call.id},
          ios: IOSParams(
            handleType: 'generic',
            supportsVideo: call.video,
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

@visibleForTesting
bool callEndedByUs(String id) => _endedByUs(id);

/// "End" on the system call UI hangs up only a call that is really running
/// here — never the ringing one, nor one we ended ourselves a moment ago.
@visibleForTesting
bool systemEndHangsUp(CallSession s, String id) =>
    !_endedByUs(id) &&
    s.busy &&
    s.call?.id == id &&
    s.phase != CallPhase.incoming;

final _claimedRings = <String, DateTime>{};

/// True for the first caller within a minute for [callId], in this isolate
/// (memory) and across isolates (a marker in the shared preferences).
Future<bool> _claimRing(String callId) async {
  final now = DateTime.now();
  final mine = _claimedRings[callId];
  if (mine != null && now.difference(mine) < const Duration(minutes: 1)) {
    return false;
  }
  _claimedRings[callId] = now;
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    final key = 'call.ring.$callId';
    final at = prefs.getInt(key);
    if (at != null &&
        now.millisecondsSinceEpoch - at <
            const Duration(minutes: 1).inMilliseconds) {
      return false;
    }
    await prefs.setInt(key, now.millisecondsSinceEpoch);
  } on Object {
    // No preferences here: the in-memory claim has to do.
  }
  return true;
}

@visibleForTesting
Future<bool> claimRingForTest(String callId) => _claimRing(callId);

@visibleForTesting
void forgetRingClaimsForTest() => _claimedRings.clear();

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
  // Device test 2026-10-21: the push (background isolate) and the socket
  // (app isolate) rang the same call 54 ms apart — two Telecom calls, of
  // which «end» closed one and the other stayed as a ghost. One claim per
  // call id, shared by both isolates.
  if (!await _claimRing(callId)) return;
  try {
    // Already on screen (iOS: PushKit reported it before the socket did):
    // a second report would replace the call and end the one being answered.
    final shown = await FlutterCallkitIncoming.activeCalls();
    if (shown.any((c) => c.id == callId)) return;
  } on Object {
    // No plugin / cannot tell: go on.
  }
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
        ios: IOSParams(
          handleType: 'generic',
          supportsVideo: video,
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
  await clearGroupCallNotice(callId);
  try {
    final calls = await FlutterCallkitIncoming.activeCalls();
    final mine = calls.where((c) => c.id == callId);
    if (mine.isEmpty || (!over && mine.any((c) => c.isAccepted))) return;
    await FlutterCallkitIncoming.endCall(callId);
  } on Object catch (e) {
    debugPrint('callkit unavailable: $e');
  }
}

/// Owner 2026-10-21: the light «X started a call · Join» notification of a
/// call from a group chat (tag `gc:<callId>`, FCM shows it with id 0) goes
/// when the call is over or the person has joined.
Future<void> clearGroupCallNotice(String callId) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
  try {
    await FlutterLocalNotificationsPlugin().cancel(id: 0, tag: 'gc:$callId');
  } on Object {
    // No plugin / nothing shown.
  }
}

/// FCM in the background / killed app (Android data-only push): ring, or
/// stop ringing when the call is over.
@pragma('vm:entry-point')
Future<void> lawbidBackgroundMessage(RemoteMessage message) async {
  final d = message.data;
  // Owner 2026-10-20: a planner reminder (data-only, Android) is drawn by
  // the app under the id of its own alarm.
  if (d['type'] == taskReminderType) {
    await showTaskReminderFromPush(d);
    return;
  }
  final callId = d['callId'];
  if (callId is! String) return;
  if (d['type'] == 'call_ended') {
    final over = d['ended'] == '1';
    // The app's own isolate (alive in the background while a call runs)
    // holds the call: tell it to re-read the call from the server now.
    await clearGroupCallNotice(callId);
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
            if (systemEndHangsUp(s, callKitParams.id)) {
              await controller.hangUp();
            }
          case CallEventActionCallDecline(:final callKitParams):
            // Our own dismiss (answered elsewhere, replaced by the ongoing
            // call) is reported as a decline too: not the user's choice.
            if (_endedByUs(callKitParams.id)) break;
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
        // Accepted: carry on. Not accepted: still ringing, or a ghost of a
        // call that ended while the app was closed — the server decides
        // (ringFromPush takes a finished one off the screen).
        await ref
            .read(callControllerProvider.notifier)
            .ringFromPush(c.id, accept: c.isAccepted);
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
