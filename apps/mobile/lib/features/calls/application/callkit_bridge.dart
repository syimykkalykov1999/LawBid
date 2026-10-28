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
    final from = StackTrace.current.toString().split('\n');
    callTrace(
      'callkit dismiss $callId from ${from.skip(1).take(2).join(' | ')}',
    );
    // The plugin reports our own endCall back as an "ended" / "declined"
    // event: that is not the user hanging up (Android: answering from the
    // heads-up ended the call it had just answered).
    _ignoreEnded(callId);
    try {
      await FlutterCallkitIncoming.endCall(callId);
    } on Object {
      // No plugin / already gone.
    }
    await endAndroidSystemCall(callId);
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
      // Owner 2026-10-21 (Apple / LiveKit's CallKit design): the system
      // call is THE call for its whole life. Answered on the sheet: it stays
      // (green bar, audio session held by iOS). Answered in the app while
      // the sheet rings: answer that same call — never end it and start a
      // new one (that ended the call the person had just answered).
      try {
        final calls = await FlutterCallkitIncoming.activeCalls();
        final mine = calls.where((c) => c.id == call.id).firstOrNull;
        if (mine != null) {
          callTrace('answered: callkit keeps ${call.id} '
              'accepted=${mine.isAccepted}');
          if (!mine.isAccepted) {
            await FlutterCallkitIncoming.setCallConnected(call.id);
          }
          return;
        }
      } on Object {
        // No plugin: fall through.
      }
      callTrace('answered: no callkit call for ${call.id}, registering');
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

StreamController<CallEvent?>? _callkitEvents;

/// The ONE subscription to the plugin's event channel. iPhone test
/// 2026-10-22 (the answered call «dropped»): a Flutter event channel feeds
/// its last subscriber only — the push service's token listener, opened
/// after the call controller's, took the channel, and «Accept» from the
/// CallKit sheet never reached the controller (iOS had answered, the app
/// kept ringing, the caller heard ringback until the 60 s timeout). Every
/// listener in the app goes through this one stream.
Stream<CallEvent?> callkitEvents() {
  final existing = _callkitEvents;
  if (existing != null) return existing.stream;
  final controller = StreamController<CallEvent?>.broadcast();
  _callkitEvents = controller;
  try {
    FlutterCallkitIncoming.onEvent.listen(
      controller.add,
      onError: (Object e, StackTrace s) {
        callTrace('callkit event error: $e');
        controller.addError(e, s);
      },
    );
  } on Object catch (e) {
    // No plugin (tests, desktop): an empty stream.
    callTrace('callkit events unavailable: $e');
  }
  return controller.stream;
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
  // Owner 2026-10-28: the call stopped ringing before this (late) ring got
  // here — the native side marked it (CallRinging.kt): never show it.
  if (await ringEndedAlready(callId)) return;
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
      lawbidIncomingParams(
        callId: callId,
        callerName: callerName,
        avatarUrl: avatarUrl,
        silent: silent,
        video: video,
      ),
    );
  } on Object catch (e) {
    debugPrint('callkit unavailable: $e');
  }
}

/// The system ringing screen of one call (Android full-screen notification
/// / iOS CallKit). Owner 2026-10-26: the caller's photo goes in as
/// `avatar` — Android's call notification downloads it (large icon and
/// the full-screen screen); an empty link means none (no broken picture).
@visibleForTesting
CallKitParams lawbidIncomingParams({
  required String callId,
  required String callerName,
  String? avatarUrl,
  bool silent = false,
  bool video = false,
  TargetPlatform? platform,
}) {
  final android = (platform ?? defaultTargetPlatform) == TargetPlatform.android;
  final photo =
      avatarUrl != null && avatarUrl.startsWith('http') ? avatarUrl : null;
  return CallKitParams(
    id: callId,
    nameCaller: callerName,
    appName: 'LawBid',
    avatar: photo,
    handle: 'LawBid',
    // 0 = audio call, 1 = video call. Android always rings as audio: the
    // call service has no camera foreground-service type (video calls off).
    type: video && !android ? 1 : 0,
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
  );
}

/// Owner 2026-10-26: what a ringing call push (`incoming_call`, FCM data or
/// the iPhone's VoIP push) says — the same keys the server sends
/// (push-dispatcher.ts dispatchCall). Null for any other push.
typedef IncomingCallPush = ({
  String callId,
  String callerName,
  String? avatarUrl,
  bool silent,
  bool video,
});

@visibleForTesting
IncomingCallPush? incomingCallFromPush(Map<String, dynamic> d) {
  final callId = d['callId'];
  if (d['type'] != 'incoming_call' || callId is! String || callId.isEmpty) {
    return null;
  }
  final avatar = d['avatarUrl'];
  return (
    callId: callId,
    callerName: '${d['callerName'] ?? d['title'] ?? 'LawBid'}',
    avatarUrl: avatar is String && avatar.isNotEmpty ? avatar : null,
    silent: d['silent'] == '1',
    video: d['video'] == '1',
  );
}

/// Owner 2026-10-28 (a locked Samsung rang on after the caller hung up):
/// the native stop (CallRinging.kt) marks the call in the shared
/// preferences; a ring that comes after it is not shown.
const ringEndedPrefix = 'call.ended.';

@visibleForTesting
Future<bool> ringEndedAlready(String callId) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.reload();
    final at = prefs.getInt('$ringEndedPrefix$callId');
    return at != null &&
        DateTime.now().millisecondsSinceEpoch - at <
            const Duration(minutes: 5).inMilliseconds;
  } on Object {
    return false;
  }
}

/// Owner 2026-10-28 (Samsung: the phone still showed a call in progress
/// after the end, and the locked phone's ringing screen stayed): Android's
/// own side of ending [callId] — its self-managed Telecom call, the call
/// plugin's ongoing-call service and its full-screen ringing screen
/// (MainActivity → CallRinging.endAll). Nothing on other platforms.
Future<void> endAndroidSystemCall(String callId) async {
  if (kIsWeb || defaultTargetPlatform != TargetPlatform.android) return;
  try {
    await const MethodChannel('lawbid/call_service')
        .invokeMethod<void>('endCall', {'id': callId});
  } on Object {
    // No host (the push isolate, tests): the plugin's own end has run.
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

/// Owner 2026-10-26: the Dart entry of the iPhone's stand-in engine
/// (AppDelegate.swift callkitPlugin): a VoIP push that wakes a closed app
/// only needs the CallKit plugin up to report the call — nothing runs here.
@pragma('vm:entry-point')
void callkitPushEntry() {}

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
  final ring = incomingCallFromPush(d);
  if (ring == null) return;
  await showLawbidIncoming(
    callId: ring.callId,
    callerName: ring.callerName,
    // Owner 2026-10-26: the photo was missing on calls rung by a push.
    avatarUrl: ring.avatarUrl,
    silent: ring.silent,
    video: ring.video,
  );
}

/// Owner 2026-10-28: a cold start (the app woken by a call) restores the
/// session a moment after the call events arrive. Waits until signed in,
/// at most [limit]; the server then answers instead of a 401.
@visibleForTesting
Future<void> whenSignedIn(
  Ref ref, {
  Duration limit = const Duration(seconds: 20),
  Duration step = const Duration(milliseconds: 250),
}) async {
  final until = DateTime.now().add(limit);
  try {
    while (ref.mounted &&
        ref.read(callMyIdProvider) == null &&
        DateTime.now().isBefore(until)) {
      await Future<void>.delayed(step);
    }
  } on Object {
    // Disposed meanwhile: the caller's own guards take it from here.
  }
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
    sub = callkitEvents().listen(
      (event) async {
        callTrace('callkit event ${event.runtimeType}');
        final controller = ref.read(callControllerProvider.notifier);
        switch (event) {
          case CallEventActionCallAccept(:final callKitParams):
            callTrace('callkit accept ${callKitParams.id}');
            // Answered on the lock screen of a closed app: the session is
            // still being restored — asking the call now went out with no
            // token (401) and took the answered call down.
            await whenSignedIn(ref);
            await controller.ringFromPush(callKitParams.id, accept: true);
          case CallEventActionCallEnded(:final callKitParams):
            // iOS: "End" on the system call UI (the green pill / lock
            // screen) hangs up. Our own endCall() also reports it — the
            // call is already over then.
            final s = ref.read(callControllerProvider);
            callTrace('callkit ended ${callKitParams.id} '
                'byUs=${_endedByUs(callKitParams.id)} phase=${s.phase}');
            if (systemEndHangsUp(s, callKitParams.id)) {
              await controller.hangUp();
            }
          case CallEventActionCallTimeout(:final id):
            callTrace('callkit timeout $id');
          case CallEventActionCallToggleAudioSession(:final isActive):
            callTrace('callkit audio session active=$isActive');
          case CallEventActionCallDecline(:final callKitParams):
            callTrace('callkit decline ${callKitParams.id} '
                'byUs=${_endedByUs(callKitParams.id)}');
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
      // Owner 2026-10-28 (prod log: GET /calls/:id → 401 «Missing bearer
      // token» from a waking phone): not before the session is back.
      await whenSignedIn(ref);
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
