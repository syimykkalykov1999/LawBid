import 'dart:async';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/diagnostics/crash_reporter.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/notifications/application/call_mute.dart';
import 'package:lawbid/features/notifications/application/system_notifications.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:proximity_sensor/proximity_sensor.dart';

/// What the call screen shows (OQ-041).
enum CallPhase {
  /// No call.
  idle,

  /// We are calling; the other phone rings.
  outgoing,

  /// Their call rings here.
  incoming,

  /// Picked up; the audio link is being set up.
  connecting,

  /// Talking.
  active,

  /// Over — the screen shows why for a moment, then closes.
  ended,
}

@immutable
class CallSession {
  const CallSession({
    this.phase = CallPhase.idle,
    this.call,
    this.peer,
    this.muted = false,
    this.speaker = false,
    this.connectedAt,
    this.outcome,
    this.errorCode,
    this.staleCallId,
    this.video = false,
    this.cameraOn = true,
    this.reconnecting = false,
    this.notice,
    this.videoPrompt,
  });

  /// Owner 2026-10-22 (WhatsApp): the member (user id) who just switched
  /// their camera on while ours is off — the screen asks «Turn on yours?».
  final String? videoPrompt;

  /// Group calls: something the screen tells the person for a moment
  /// ([kNoticeMutedByHost]).
  final String? notice;

  /// Owner 2026-10-05: a video call; [cameraOn] = our camera is sending.
  /// Owner 2026-10-22: it changes mid-call — a voice call becomes a video
  /// one when either side switches a camera on, and goes back to voice
  /// when no camera is left on.
  final bool video;
  final bool cameraOn;

  /// Owner 2026-10-20: the link dropped; the call tries to come back
  /// ("Reconnecting…") before it gives up.
  final bool reconnecting;

  final CallPhase phase;
  final AppCall? call;

  /// Known before the server answers (outgoing, from the chat header).
  final CallPeer? peer;
  final bool muted;
  final bool speaker;
  final DateTime? connectedAt;

  /// Why it ended (server status), for the last screen.
  final CallStatus? outcome;

  /// An API refusal (CALL_NOT_ALLOWED, SUBSCRIPTION_REQUIRED, …).
  final String? errorCode;

  /// Telegram-style 409: the server says we are in a call this device does
  /// not have (another phone, or a hang-up that never arrived) — the screen
  /// offers to end it.
  final String? staleCallId;

  bool get busy => phase != CallPhase.idle && phase != CallPhase.ended;

  CallSession copyWith({
    CallPhase? phase,
    AppCall? call,
    CallPeer? peer,
    bool? muted,
    bool? speaker,
    DateTime? connectedAt,
    CallStatus? outcome,
    String? errorCode,
    String? staleCallId,
    bool? video,
    bool? cameraOn,
    bool? reconnecting,
    String? notice,
    bool clearNotice = false,
    String? videoPrompt,
    bool clearVideoPrompt = false,
  }) =>
      CallSession(
        phase: phase ?? this.phase,
        call: call ?? this.call,
        peer: peer ?? this.peer,
        muted: muted ?? this.muted,
        speaker: speaker ?? this.speaker,
        connectedAt: connectedAt ?? this.connectedAt,
        outcome: outcome ?? this.outcome,
        errorCode: errorCode ?? this.errorCode,
        staleCallId: staleCallId ?? this.staleCallId,
        video: video ?? this.video,
        cameraOn: cameraOn ?? this.cameraOn,
        reconnecting: reconnecting ?? this.reconnecting,
        notice: clearNotice ? null : notice ?? this.notice,
        videoPrompt: clearVideoPrompt ? null : videoPrompt ?? this.videoPrompt,
      );
}

/// Our own user id (the JWT `sub`): the row of the member list that is us.
final callMyIdProvider = Provider<String?>(
  (ref) => ref.watch(sessionControllerProvider.select((s) => s?.sub)),
);

/// Sends a signaling payload to the other member of [callId].
/// Group calls: [to] names the member the signal is for.
typedef CallSignalSender = Future<bool> Function(
  String callId,
  Map<String, Object?> data, {
  String? to,
});

/// A signal that did not get through (the socket blinked on a weak signal)
/// is sent again after these pauses — without an offer, an answer or a
/// candidate the link never comes up.
const kCallSignalRetries = [
  Duration(milliseconds: 400),
  Duration(seconds: 1),
  Duration(seconds: 2),
  Duration(seconds: 4),
  Duration(seconds: 8),
];

final callSignalSenderProvider = Provider<CallSignalSender>((ref) {
  var offerSeq = 0;
  Future<bool> once(
    String callId,
    Map<String, Object?> data,
    String? to,
  ) async {
    try {
      return await ref
              .read(realtimeClientProvider)
              ?.callSignal(callId, data, to: to) ??
          false;
    } on Object {
      return false;
    }
  }

  return (callId, data, {to}) async {
    // A newer offer replaces an older one that is still being retried.
    final isOffer = data['type'] == 'offer';
    final seq = isOffer ? ++offerSeq : 0;
    if (await once(callId, data, to)) return true;
    for (final pause in kCallSignalRetries) {
      await Future<void>.delayed(pause);
      if (isOffer && seq != offerSeq) return false;
      if (await once(callId, data, to)) return true;
    }
    return false;
  };
});

/// The phone's own ringing UI (CallKit / ConnectionService); a no-op in
/// tests and where the plugin is missing.
abstract interface class SystemCallUi {
  Future<void> showIncoming(AppCall call);
  Future<void> dismiss(String callId);

  /// Android: the ongoing-call notification with the timer, and the
  /// microphone foreground service that keeps the call alive in the
  /// background. Started while the app is in the foreground.
  Future<void> showOngoing(AppCall call);

  /// This phone answered [call]: the ringing screen goes away and the
  /// ongoing-call UI takes its place (Android notification + service; on
  /// iPhone a call answered on the CallKit screen stays there, so its green
  /// bar and audio session last until [dismiss] at the end).
  Future<void> answered(AppCall call);

  /// The call is over: no ringing / ongoing leftover of any call stays in
  /// the notification shade (ghosts of calls ended while the app slept).
  Future<void> endAll();
}

class NoSystemCallUi implements SystemCallUi {
  const NoSystemCallUi();

  @override
  Future<void> showIncoming(AppCall call) async {}

  @override
  Future<void> dismiss(String callId) async {}

  @override
  Future<void> showOngoing(AppCall call) async {}

  @override
  Future<void> answered(AppCall call) async {}

  @override
  Future<void> endAll() async {}
}

/// The real one (CallKit) is set in `CallHost`'s scope by the app;
/// tests keep the no-op.
final systemCallUiProvider =
    Provider<SystemCallUi>((ref) => const NoSystemCallUi());

/// The call whose ringing the phone's own call sheet shows (iOS CallKit);
/// the in-app incoming strip stays away for it.
class SystemRingingCall extends Notifier<String?> {
  @override
  String? build() => null;

  // ignore: use_setters_to_change_properties
  void set(String? id) => state = id;
}

final systemRingingCallProvider =
    NotifierProvider<SystemRingingCall, String?>(SystemRingingCall.new);

/// Owner 2026-10-21 (the iPhone drops a call the moment it is answered):
/// every step of a call goes to the server's crash list, test builds only
/// (dev / staging) — one device test then tells the whole story, no
/// second build for a log. Nothing is sent from the store build.
void callTrace(String message) {
  if (AppEnvironment.current.isProd) return;
  final at = DateTime.now().toUtc().toIso8601String().substring(11, 23);
  CrashReporter.instance?.report('calltrace $at $message', StackTrace.empty);
}

/// The caller gives up after this — about a minute, like WhatsApp (owner
/// 2026-10-20; it was 30 s); the server marks a forgotten call missed a
/// little later.
const kCallRingTimeout = Duration(seconds: 60);

/// [CallSession.errorCode] when the microphone permission was refused.
const kMicDenied = 'MIC_DENIED';

/// [CallSession.errorCode] when the host removed us from a group call.
const kRemovedFromCall = 'REMOVED_FROM_CALL';

/// [CallSession.notice]: the host switched our microphone off (we may
/// switch it on again).
const kNoticeMutedByHost = 'MUTED_BY_HOST';

/// Owner 2026-10-21: how a vote to remove a member ended; the notice reads
/// `VOTE_PASSED:<userId>`.
const kNoticeVotePassed = 'VOTE_PASSED';
const kNoticeVoteFailed = 'VOTE_FAILED';

/// Owner 2026-10-22: a camera can be switched on mid-call in calls of up to
/// this many people (a mesh: every camera goes to every member).
const kVideoSwitchMaxPeople = 9;

/// The link must come up this fast after pick-up, else "failed".
const kCallConnectTimeout = Duration(seconds: 45);

/// While a call lives, its state is re-read from the server this often (a
/// missed `call:ended` must not leave the other phone ringing or talking).
const kCallSyncInterval = Duration(seconds: 8);

/// An incoming ring stops by itself this long after the caller's timeout.
const kCallRingGrace = Duration(seconds: 10);

/// A dropped link gets this long to come back (new Wi-Fi / 4G network, a
/// tunnel, a lift) before the call ends; the caller restarts ICE every few
/// seconds. Owner 2026-10-21: the worst internet must not end a call.
const kCallReconnectGrace = Duration(seconds: 150);
const kCallReconnectRetry = Duration(seconds: 6);

/// The TURN login lives 24 h on the server; a running call takes a fresh one
/// this often, so a call of days never meets an expired relay.
const kCallTurnRefresh = Duration(hours: 6);

/// A change of network (Wi-Fi ↔ 4G) restarts ICE after this short pause.
const kCallNetworkSettle = Duration(seconds: 1);

/// How long the "Call ended" screen stays.
const kCallEndedLinger = Duration(milliseconds: 1600);

/// Who the call is with: the other person, or for a group the first two
/// names and a count.
String callLabel(CallSession s, String? me) {
  final call = s.call;
  if (call != null && call.group) {
    final names = [
      for (final m in call.participants)
        if (m.userId != me && (m.joined || m.ringing)) m.name,
    ];
    if (names.length > 2) {
      return '${names.take(2).join(', ')} +${names.length - 2}';
    }
    if (names.isNotEmpty) return names.join(', ');
  }
  final n = (s.peer ?? call?.peer)?.name ?? '';
  return n.isEmpty ? 'LawBid' : n;
}

/// OQ-041: one call at a time on this device. Rings in (`call:incoming`),
/// calls out, answers, relays WebRTC signaling over the realtime socket,
/// and tears everything down on hang-up, decline, timeout or failure.
class CallController extends Notifier<CallSession> {
  CallMedia? _media;
  StreamSubscription<RealtimeEvent>? _events;
  Timer? _ringTimer;
  Timer? _connectTimer;
  Timer? _syncTimer;
  Timer? _linger;
  Timer? _turnTimer;
  Timer? _netTimer;
  StreamSubscription<bool>? _netSub;
  final _earlySignals = <({String? from, Map<String, Object?> data})>[];
  bool _mediaOpen = false;

  // Per-member links (a two-person call has one).
  final _offered = <String>{};

  /// Owner 2026-10-22: links we sent a new offer on mid-call (a camera
  /// switched on) whose answer has not come yet.
  final _renegotiating = <String>{};

  /// The call began as a video call: every member is taken to send a
  /// picture until they say their camera is off.
  bool _startedVideo = false;

  /// Members who switched their camera on mid-call ({'type':'video'}).
  final _videoPeers = <String>{};

  /// An offer (we answer) or an answer (we offered) has come through: the
  /// signalling reaches us, no need to nudge it again (see [_nudgeSignals]).
  bool _signalSeen = false;
  final _connected = <String>{};
  final _reconnect = <String, ({Timer grace, Timer retry})>{};
  bool _syncingLinks = false;
  bool _syncAgain = false;

  String? get _me => ref.read(callMyIdProvider);

  /// Bumped by every [_reset]: an await that wakes up under another
  /// generation belongs to a call that is already over.
  int _gen = 0;

  CallsRepository get _repo => ref.read(callsRepositoryProvider);

  Future<List<IceServer>>? _ice;
  DateTime? _iceAt;

  /// Owner 2026-10-15: calls connected slowly — the relay (TURN) list was
  /// fetched only after the mic was asked for, one request behind the
  /// other. It is now fetched alongside the call request, or while the
  /// phone rings, and reused for a few minutes.
  Future<List<IceServer>> _iceServers() {
    final at = _iceAt;
    final cached = _ice;
    if (cached != null &&
        at != null &&
        DateTime.now().difference(at) < const Duration(minutes: 5)) {
      return cached;
    }
    final fresh = _repo.iceServers();
    _ice = fresh;
    _iceAt = DateTime.now();
    fresh.ignore();
    // A failed fetch must not stay cached.
    unawaited(
      fresh.then<void>(
        (_) {},
        onError: (Object _) {
          if (identical(_ice, fresh)) _ice = null;
        },
      ),
    );
    return fresh;
  }

  /// The live media — the call screen shows its video streams.
  CallMedia? get media => _media;

  @override
  CallSession build() {
    // Owner 2026-10-20: `listen`, not `watch` — when the realtime provider
    // rebuilt (the socket came back after the app was minimised) a watch
    // rebuilt this controller too: the live call state became "idle" while
    // the audio went on, so the screen showed "?" and "You're already in a
    // call", and the call could be neither found nor ended.
    ref.listen<Stream<RealtimeEvent>>(
      realtimeEventsProvider,
      (_, stream) {
        _events?.cancel();
        _events = stream.listen(_onEvent);
      },
      fireImmediately: true,
    );
    // The ongoing-call notification follows the call; its buttons come back.
    listenSelf(_syncForeground);
    listenSelf(_syncProximity);
    final fg = ref.read(callForegroundProvider);
    final actions = fg.actions.listen(_onNotificationAction);
    unawaited(
      fg.pendingAction().then<void>((a) {
        if (a != null) _onNotificationAction(a);
      }),
    );
    ref.onDispose(() {
      unawaited(actions.cancel());
      _events?.cancel();
      _clearTimers();
      unawaited(_media?.close());
    });
    return const CallSession();
  }

  // Like WhatsApp: an audio call held to the ear (no speaker) turns the
  // screen off while the phone is near the face.
  bool _proximityOn = false;

  void _syncProximity(CallSession? prev, CallSession next) {
    if (kIsWeb) return;
    final on = !next.video &&
        !next.speaker &&
        (next.phase == CallPhase.connecting || next.phase == CallPhase.active);
    if (on == _proximityOn) return;
    _proximityOn = on;
    unawaited(
      ProximitySensor.setProximityScreenOff(on).then<void>(
        (_) {},
        onError: (Object _) {},
      ),
    );
  }

  // Android ongoing-call notification (owner 2026-10-20).
  String? _fgKey;

  void _syncForeground(CallSession? prev, CallSession next) {
    final fg = ref.read(callForegroundProvider);
    final live = next.phase == CallPhase.outgoing ||
        next.phase == CallPhase.connecting ||
        next.phase == CallPhase.active;
    if (!live) {
      if (_fgKey != null) {
        _fgKey = null;
        unawaited(fg.stop());
      }
      return;
    }
    final name = callLabel(next, _me);
    final since = next.phase == CallPhase.active
        ? (next.connectedAt ?? DateTime.now()).millisecondsSinceEpoch
        : 0;
    final key = '$name|$since';
    if (key == _fgKey) return;
    _fgKey = key;
    final t = ref.read(translatorProvider);
    unawaited(
      fg.start(
        name: name,
        since: since,
        status: t.t(since > 0 ? 'call.ongoing' : 'call.status.connecting'),
        hangup: t.t('call.end'),
      ),
    );
  }

  void _onNotificationAction(String action) {
    if (action == 'hangup') {
      if (state.busy) {
        unawaited(hangUp());
      } else {
        // A stale notification: nothing to hang up, just clear it.
        unawaited(ref.read(callForegroundProvider).stop());
      }
    } else if (state.busy) {
      ref.read(callOpenRequestProvider.notifier).bump();
    }
  }

  // --- Outgoing ------------------------------------------------------------

  /// Calls the other member of [conversationId]; [video] = a video call
  /// (owner 2026-10-05).
  Future<void> call(
    String conversationId, {
    CallPeer? peer,
    bool video = false,
  }) async {
    if (state.busy) {
      // Already talking: the call button takes you back to that call.
      ref.read(callOpenRequestProvider.notifier).bump();
      return;
    }
    _reset();
    final gen = _gen;
    state = CallSession(
      phase: CallPhase.outgoing,
      peer: peer,
      video: video,
      speaker: video,
    );
    try {
      // The microphone first: a refusal must not ring the other phone.
      if (!await ref.read(callMicPermissionProvider)()) {
        if (gen != _gen || !ref.mounted) return;
        state = state.copyWith(errorCode: kMicDenied);
        _finish(CallStatus.failed);
        return;
      }
      if (gen != _gen || !ref.mounted) return;
      unawaited(_iceServers().then<void>((_) {}, onError: (Object _) {}));
      final call = await _repo.start(conversationId, video: video);
      if (!ref.mounted) return;
      if (gen != _gen) {
        // Cancelled while the request was in flight: the server made the
        // call all the same — end it, start nothing here.
        unawaited(_endQuietly(call.id, CallEndReason.hangup));
        return;
      }
      if (call.status == CallStatus.busy) {
        _finish(call.status, call: call);
        return;
      }
      state = state.copyWith(call: call, peer: call.peer);
      unawaited(ref.read(systemCallUiProvider).showOngoing(call));
      // OQ-044: the caller hears ringback tones while it rings there.
      unawaited(ref.read(appSoundsProvider).startRingback());
      // Armed before the media opens: with no network that step can hang,
      // and the ringback must still stop (owner 2026-10-20).
      _ringTimer = Timer(kCallRingTimeout, () {
        if (state.phase == CallPhase.outgoing) {
          unawaited(hangUp(reason: CallEndReason.noAnswer));
        }
      });
      _startSync();
      // Mic + connection ready while it rings: pick-up connects faster.
      await _openMedia(call.id, video: call.video, peer: call.peer.id);
      if (gen == _gen && state.phase == CallPhase.outgoing) {
        unawaited(ref.read(appSoundsProvider).keepRingback());
      }
    } on ApiException catch (e) {
      if (gen != _gen) return;
      final raw = (e.details ?? const <String, dynamic>{})['callId'];
      final stale =
          e.code == ApiErrorCodes.callInProgress && raw is String ? raw : null;
      state = state.copyWith(errorCode: e.code, staleCallId: stale);
      _finish(CallStatus.failed, keepOpen: stale != null);
    } on Object catch (e) {
      if (gen != _gen) return;
      final id = state.call?.id;
      if (_isMicDenied(e)) state = state.copyWith(errorCode: kMicDenied);
      _finish(CallStatus.failed);
      if (id != null) unawaited(_endQuietly(id, CallEndReason.failed));
    }
  }

  /// "End it there" on the 409 sheet: closes the call the server still
  /// holds for us, then clears the screen so the person can call again.
  Future<void> endOtherDeviceCall() async {
    final id = state.staleCallId;
    if (id == null || state.busy) return;
    state = const CallSession();
    await _endQuietly(id, CallEndReason.hangup);
  }

  /// "Cancel" on the 409 sheet.
  void dismissStale() {
    if (state.staleCallId != null && !state.busy) state = const CallSession();
  }

  // --- Incoming ------------------------------------------------------------

  Future<void> accept() async {
    final call = state.call;
    if (call == null || state.phase != CallPhase.incoming) return;
    // The system sheet's answer and the start-up scan can both ask: once.
    if (_accepting == call.id) return;
    _accepting = call.id;
    final gen = _gen;
    callTrace('accept ${call.id} start');
    unawaited(ref.read(appSoundsProvider).stopRingtone());
    if (!await ref.read(callMicPermissionProvider)()) {
      // Cannot talk: decline, so the caller is not left waiting.
      callTrace('accept ${call.id}: microphone not allowed, declining');
      if (!ref.mounted || state.call?.id != call.id) return;
      _accepting = null;
      state = state.copyWith(errorCode: kMicDenied);
      unawaited(ref.read(systemCallUiProvider).dismiss(call.id));
      _finish(CallStatus.declined);
      unawaited(
        _repo.decline(call.id).then<void>((_) {}, onError: (Object _) {}),
      );
      return;
    }
    if (!ref.mounted || gen != _gen || state.phase != CallPhase.incoming) {
      return;
    }
    state = state.copyWith(phase: CallPhase.connecting);
    unawaited(_swapToOngoing(call));
    // Group calls: someone added us to a running call — we are the latest
    // to join, so we offer to everyone; nobody offers to us.
    final me = _me;
    final invited = call.group &&
        me != null &&
        call.participants.any((m) => m.userId == me && m.ringing);
    try {
      // The answer to the server and the mic/connection run side by side:
      // the caller's offer waits in [_earlySignals] until the media is open.
      final acceptF = _repo.accept(call.id);
      unawaited(acceptF.then<void>((_) {}, onError: (Object _) {}));
      await _openMedia(call.id, video: call.video, peer: call.peer.id);
      callTrace('accept ${call.id}: media open');
      final accepted = await acceptF;
      callTrace('accept ${call.id}: server accepted, status '
          '${accepted.status} gen=${gen == _gen} mounted=${ref.mounted}');
      // The call ended (or another began) while the answer was in flight.
      if (!ref.mounted || gen != _gen) return;
      state = state.copyWith(call: accepted);
      _armConnectTimeout();
      // The caller's offer may already be here.
      final early = List.of(_earlySignals);
      _earlySignals.clear();
      for (final e in early) {
        await _onSignal(e.data, from: e.from);
      }
      if (invited) {
        await _offerTo(call.id, call.peer.id);
        await _syncLinks();
      }
      unawaited(_nudgeSignals(call.id));
    } on ApiException catch (e) {
      callTrace('accept ${call.id}: server refused ${e.statusCode} ${e.code}');
      if (gen != _gen) return;
      state = state.copyWith(errorCode: e.code);
      _finish(CallStatus.failed);
    } on Object catch (e) {
      callTrace('accept ${call.id}: failed: $e');
      if (gen != _gen) return;
      if (_isMicDenied(e)) state = state.copyWith(errorCode: kMicDenied);
      _finish(CallStatus.failed);
      unawaited(_endQuietly(call.id, CallEndReason.failed));
    }
  }

  Future<void> decline() async {
    final call = state.call;
    if (call == null || state.phase != CallPhase.incoming) return;
    unawaited(ref.read(systemCallUiProvider).dismiss(call.id));
    _finish(CallStatus.declined);
    try {
      await _repo.decline(call.id);
    } on Object {
      // The server sweeps it to missed anyway.
    }
  }

  /// Hang up / cancel.
  Future<void> hangUp({
    CallEndReason reason = CallEndReason.hangup,
    // Group call, host: end it for everyone, not just leave (Telegram).
    bool forAll = false,
  }) async {
    final call = state.call;
    final wasActive = state.phase == CallPhase.active;
    // The server hears it first: the media closing sends the other phone a
    // "link lost" before anything else, and it must not beat the hang-up
    // (it showed "Reconnecting…" for seconds on a video call).
    final gid = call?.groupId;
    final me = _me;
    final othersIn = call == null
        ? 0
        : call.participants.where((m) => m.joined && m.userId != me).length;
    // The way back is only offered into a call that goes on without us.
    // A call made a group by adding people comes back by its id (WhatsApp).
    if (call != null && call.group && !forAll && wasActive && othersIn > 0) {
      ref.read(groupRejoinProvider.notifier).set(
            GroupRejoin(
              groupId: gid,
              callId: gid == null ? call.id : null,
              title: state.peer?.displayName ?? '',
              avatarUrl: state.peer?.avatarUrl,
            ),
          );
    } else if (forAll) {
      ref.read(groupRejoinProvider.notifier).set(null);
    }
    final ending =
        call == null ? null : _endQuietly(call.id, reason, forAll: forAll);
    _finish(
      switch (reason) {
        CallEndReason.noAnswer => CallStatus.missed,
        CallEndReason.failed => CallStatus.failed,
        CallEndReason.hangup =>
          wasActive ? CallStatus.ended : CallStatus.canceled,
      },
    );
    await ending;
  }

  void toggleMute() {
    final muted = !state.muted;
    _media?.setMuted(muted);
    state = state.copyWith(muted: muted, clearNotice: true);
    _shareMuteState(muted: muted);
  }

  /// Group calls: the others' list shows our microphone (best effort).
  void _shareMuteState({required bool muted}) {
    final call = state.call;
    if (call == null || !call.group) return;
    unawaited(
      _repo
          .setMuteState(call.id, muted: muted)
          .then<void>((_) {}, onError: (Object _) {}),
    );
  }

  /// The screen showed the notice.
  void dismissNotice() {
    if (state.notice != null) state = state.copyWith(clearNotice: true);
  }

  // --- Calls from a group chat (owner 2026-10-20) ---------------------------

  /// The phone / video buttons of a group chat: this phone becomes the host
  /// of a call that lives in the group; [userIds] ring, the others join from
  /// the chat. [peer] carries the group's name and photo for the screen.
  /// Returns the API error code, or null when it worked.
  Future<String?> startGroupCall(
    String groupId, {
    required CallPeer peer,
    bool video = false,
    List<String> userIds = const [],
  }) =>
      _enterGroupCall(
        peer: peer,
        video: video,
        open: () => _repo.startGroup(groupId, video: video, userIds: userIds),
      );

  /// Owner 2026-10-21 (inbox 20e): the phone / video button of a channel
  /// (owner / admins). Nobody rings; subscribers join from the channel.
  Future<String?> startChannelCall(
    String channelId, {
    required CallPeer peer,
    bool video = false,
  }) =>
      _enterGroupCall(
        peer: peer,
        video: video,
        open: () => _repo.startChannel(channelId, video: video),
      );

  /// "Join" on the banner of a group chat with a call running.
  Future<String?> joinGroupCall(AppCall running, {required CallPeer peer}) =>
      _enterGroupCall(
        peer: peer,
        video: running.video,
        open: () => _repo.join(running.id),
      );

  Future<String?> _enterGroupCall({
    required CallPeer peer,
    required bool video,
    required Future<AppCall> Function() open,
  }) async {
    if (state.busy) {
      ref.read(callOpenRequestProvider.notifier).bump();
      return null;
    }
    _reset();
    ref.read(groupRejoinProvider.notifier).set(null);
    final gen = _gen;
    state = CallSession(
      phase: CallPhase.connecting,
      peer: peer,
      video: video,
      speaker: video,
    );
    try {
      if (!await ref.read(callMicPermissionProvider)()) {
        if (gen != _gen || !ref.mounted) return null;
        state = state.copyWith(errorCode: kMicDenied);
        _finish(CallStatus.failed);
        return kMicDenied;
      }
      if (gen != _gen || !ref.mounted) return null;
      final call = await open();
      if (!ref.mounted) return null;
      if (gen != _gen) {
        unawaited(_endQuietly(call.id, CallEndReason.hangup));
        return null;
      }
      state = state.copyWith(call: call, peer: peer);
      unawaited(ref.read(systemCallUiProvider).showOngoing(call));
      _startSync();
      await _openMedia(call.id, video: call.video);
      if (gen != _gen || !ref.mounted) return null;
      // In the room already: alone until somebody answers, linked to the
      // others at once when joining (the later joiner offers).
      state = state.copyWith(
        phase: CallPhase.active,
        connectedAt: DateTime.now(),
      );
      _applyMembers(call.hostId, call.participants);
      return null;
    } on ApiException catch (e) {
      if (gen != _gen) return e.code;
      final raw = (e.details ?? const <String, dynamic>{})['callId'];
      final stale =
          e.code == ApiErrorCodes.callInProgress && raw is String ? raw : null;
      state = state.copyWith(errorCode: e.code, staleCallId: stale);
      _finish(CallStatus.failed, keepOpen: stale != null);
      return e.code;
    } on Object catch (e) {
      if (gen != _gen) return 'ERROR';
      final id = state.call?.id;
      if (_isMicDenied(e)) state = state.copyWith(errorCode: kMicDenied);
      _finish(CallStatus.failed);
      if (id != null) unawaited(_endQuietly(id, CallEndReason.failed));
      return 'ERROR';
    }
  }

  // --- Group calls ---------------------------------------------------------

  /// Adds a person (by id or @username) to the running call. Returns the
  /// API error code, or null when it worked.
  Future<String?> invite({String? userId, String? username}) => _groupAction(
        (id) => _repo.invite(id, userId: userId, username: username),
      );

  /// Host: switches [userId]'s microphone off (they may switch it on).
  Future<String?> muteMember(String userId) => _groupAction(
        (id) => _repo.muteMember(id, userId, muted: true),
      );

  /// Host: removes [userId] from the call.
  Future<String?> removeMember(String userId) =>
      _groupAction((id) => _repo.removeMember(id, userId));

  /// Nobody runs the call: propose to remove [userId] (members vote).
  Future<String?> proposeRemoval(String userId) =>
      _groupAction((id) => _repo.startVote(id, userId));

  /// A ballot in the open vote.
  Future<String?> castVote({required bool favor}) {
    final vote = state.call?.vote;
    if (vote == null) return Future.value('CALL_STATE_CONFLICT');
    return _groupAction(
      (id) => _repo.castVote(id, vote.id, favor: favor),
    );
  }

  Future<String?> _groupAction(Future<AppCall> Function(String id) run) async {
    final call = state.call;
    if (call == null || state.phase != CallPhase.active) {
      return 'CALL_STATE_CONFLICT';
    }
    try {
      final fresh = await run(call.id);
      if (ref.mounted && state.call?.id == call.id) _applyCall(fresh);
      return null;
    } on ApiException catch (e) {
      return e.code;
    } on Object {
      return 'ERROR';
    }
  }

  /// A fresh server view of the call's members.
  void _applyCall(AppCall fresh) {
    final call = state.call;
    if (call == null || call.id != fresh.id) return;
    _applyMembers(fresh.hostId, fresh.participants, group: fresh.group);
    final now = state.call;
    if (now != null) {
      state = state.copyWith(
        call: now.copyWith(
          moderated: fresh.moderated,
          vote: fresh.vote,
          clearVote: fresh.vote == null,
        ),
      );
    }
  }

  void _applyMembers(
    String? hostId,
    List<CallMember> members, {
    bool group = true,
  }) {
    final call = state.call;
    if (call == null) return;
    state = state.copyWith(
      call: call.copyWith(group: group, hostId: hostId, participants: members),
    );
    // Someone new may have joined: tell them our camera is off.
    if (!state.cameraOn) _shareCamera();
    // Owner 2026-10-22: or that it was switched on mid-call (a call that
    // began as voice), so their screen shows it.
    if (!_startedVideo && state.video && state.cameraOn) {
      _shareVideo(on: true, cameraToo: false);
    }
    // The host switched our microphone off and we missed the event.
    final mine = members.where((m) => m.userId == _me).firstOrNull;
    if (mine != null && mine.joined && mine.mutedByHost && !state.muted) {
      _media?.setMuted(true);
      state = state.copyWith(muted: true, notice: kNoticeMutedByHost);
    }
    unawaited(_syncLinks());
  }

  /// One link per joined member: new ones are added (the later joiner
  /// offers), those who left are closed.
  Future<void> _syncLinks() async {
    if (_syncingLinks) {
      _syncAgain = true;
      return;
    }
    _syncingLinks = true;
    final gen = _gen;
    try {
      do {
        _syncAgain = false;
        final media = _media;
        final call = state.call;
        final me = _me;
        if (media == null ||
            !_mediaOpen ||
            call == null ||
            me == null ||
            !call.group ||
            (state.phase != CallPhase.connecting &&
                state.phase != CallPhase.active)) {
          return;
        }
        final mine = call.participants.where((m) => m.userId == me).firstOrNull;
        if (mine == null || !mine.joined) return;
        final others = [
          for (final m in call.participants)
            if (m.joined && m.userId != me) m,
        ];
        final ids = {for (final m in others) m.userId};
        for (final p in media.peers.toList()) {
          if (ids.contains(p)) continue;
          _forgetLink(p);
          await media.removePeer(p);
          if (gen != _gen) return;
        }
        for (final m in others) {
          if (media.peers.contains(m.userId)) continue;
          await _addLink(call.id, m.userId);
          if (gen != _gen) return;
          if (_shouldOffer(mine, m)) await _offerTo(call.id, m.userId);
          if (gen != _gen) return;
        }
      } while (_syncAgain);
    } on Object {
      // The next snapshot tries again.
    } finally {
      _syncingLinks = false;
    }
  }

  /// Of two members the later joiner offers (same time: the larger id).
  static bool _shouldOffer(CallMember mine, CallMember other) {
    final a = mine.joinedAt;
    final b = other.joinedAt;
    if (a != null && b != null) {
      final c = a.compareTo(b);
      if (c != 0) return c > 0;
    }
    return mine.userId.compareTo(other.userId) > 0;
  }

  Future<void> _addLink(String callId, String peer) => _media!.addPeer(
        peer,
        onSignal: (s) =>
            ref.read(callSignalSenderProvider)(callId, s, to: peer),
        onState: (s) => _onLinkState(peer, s),
      );

  Future<void> _offerTo(String callId, String peer) async {
    final media = _media;
    if (media == null) return;
    _offered.add(peer);
    try {
      final offer = await media.createOfferFor(peer);
      final ok = await ref.read(callSignalSenderProvider)(
        callId,
        offer,
        to: peer,
      );
      if (!ok) throw StateError('signal refused');
    } on Object {
      _linkLost(peer);
    }
  }

  void _forgetLink(String peer) {
    _offered.remove(peer);
    _renegotiating.remove(peer);
    _videoPeers.remove(peer);
    _connected.remove(peer);
    _stopReconnect(peer);
  }

  /// The host removed us.
  void _removedFromCall() {
    final call = state.call;
    if (call == null || !state.busy) return;
    state = state.copyWith(errorCode: kRemovedFromCall);
    ref.read(groupRejoinProvider.notifier).set(null);
    _finish(CallStatus.ended, call: call);
  }

  /// Video calls: camera on / off (the other side sees our avatar).
  Future<void> toggleCamera() async {
    if (!state.video) return;
    final on = !state.cameraOn;
    state = state.copyWith(cameraOn: on);
    try {
      await _media?.setCameraOn(on);
    } on Object {
      // No camera: keep the flag for the UI.
    }
    _shareCamera();
  }

  /// Everyone else learns whether our camera is on (an off camera still
  /// sends black frames — they show our photo instead).
  void _shareCamera() {
    final call = state.call;
    if (call == null || !state.video || !state.busy) return;
    unawaited(
      ref
          .read(callSignalSenderProvider)(
            call.id,
            {'type': 'camera', 'on': state.cameraOn},
          )
          .then<void>((_) {}, onError: (Object _) {}),
    );
  }

  // --- Camera on / off mid-call (owner 2026-10-22) -------------------------

  /// The camera button may switch video on / off here: a live call from a
  /// chat (1:1 or a group of up to [kVideoSwitchMaxPeople]); a channel's
  /// call keeps its own rule (the camera of a call that began as video).
  bool get canSwitchVideo {
    final call = state.call;
    if (call == null ||
        state.phase != CallPhase.active ||
        call.channelId != null) {
      return false;
    }
    return call.participants.where((m) => m.joined).length <=
        kVideoSwitchMaxPeople;
  }

  /// Owner 2026-10-22 (WhatsApp / Zoom): the camera button. A voice call
  /// becomes a video call: the camera opens, every link gets a new offer
  /// that carries it, the others hear {'type':'video','on':true} and are
  /// asked whether to turn theirs on. A camera that is on goes off for
  /// real (its light too); with no camera left on either side the screen
  /// goes back to the voice layout.
  ///
  /// The signals travel through the server untouched; it is not told.
  // TODO(owner): the server's `call.video` keeps how the call began, so the
  // call history labels a voice call that turned video as «audio». Marking
  // it would need a small call-update endpoint (not added yet).
  Future<void> toggleVideo() async {
    final call = state.call;
    final media = _media;
    if (call == null || media == null || !canSwitchVideo) return;
    final on = !(state.video && state.cameraOn);
    if (on) {
      final speaker = state.speaker;
      state = state.copyWith(
        video: true,
        cameraOn: true,
        clearVideoPrompt: true,
      );
      try {
        await media.enableVideo();
      } on Object {
        // No camera, or the camera permission refused: as it was.
        if (!ref.mounted || state.call?.id != call.id) return;
        state = state.copyWith(cameraOn: false, video: _anyPeerVideo());
        return;
      }
      if (!ref.mounted ||
          state.call?.id != call.id ||
          !identical(_media, media)) {
        return;
      }
      // Like a video call from the start: the picture comes with the
      // loudspeaker (WhatsApp).
      if (!speaker) await toggleSpeaker();
      for (final p in media.peers.toList()) {
        if (p.isNotEmpty) await _renegotiate(call.id, p);
      }
    } else {
      state = state.copyWith(
        cameraOn: false,
        video: _anyPeerVideo(),
        clearVideoPrompt: true,
      );
      try {
        await media.disableVideo();
      } on Object {
        // The camera is already gone.
      }
    }
    _shareVideo(on: on);
  }

  /// «Not now» on the «Turn on yours?» prompt.
  void dismissVideoPrompt() {
    if (state.videoPrompt != null) {
      state = state.copyWith(clearVideoPrompt: true);
    }
  }

  /// Someone else's picture is on: a call that began as video (until they
  /// say their camera is off), or one they switched on mid-call.
  bool _anyPeerVideo() {
    final off = ref.read(callCamerasOffProvider);
    return (_media?.peers ?? const <String>{}).any(
      (p) =>
          p.isNotEmpty &&
          (_startedVideo || _videoPeers.contains(p)) &&
          !off.contains(p),
    );
  }

  /// Everyone hears our camera went on / off: the new {'type':'video'} for
  /// this version, the older {'type':'camera'} for apps that only know it
  /// (they show our photo instead of a frozen frame).
  void _shareVideo({required bool on, bool cameraToo = true}) {
    final call = state.call;
    if (call == null || !state.busy) return;
    final send = ref.read(callSignalSenderProvider);
    for (final data in [
      {'type': 'video', 'on': on},
      if (cameraToo) {'type': 'camera', 'on': on},
    ]) {
      unawaited(
        send(call.id, data).then<void>((_) {}, onError: (Object _) {}),
      );
    }
  }

  /// A member's camera went on / off mid-call. On, while ours is off: the
  /// screen shows their picture, a short sound plays and the prompt asks
  /// whether to turn ours on — once per switch-on.
  void _onPeerVideo(String peer, {required bool on}) {
    final call = state.call;
    if (call == null || call.channelId != null || !state.busy) return;
    ref.read(callCamerasOffProvider.notifier).set(peer, on: on);
    if (on) {
      final fresh = _videoPeers.add(peer);
      final mineOff = !(state.video && state.cameraOn);
      if (!state.video) {
        state = state.copyWith(video: true, cameraOn: false);
        if (!state.speaker) unawaited(toggleSpeaker());
      }
      if (fresh && mineOff) {
        state = state.copyWith(videoPrompt: peer);
        unawaited(ref.read(appSoundsProvider).videoRequest());
      }
      return;
    }
    _videoPeers.remove(peer);
    if (state.videoPrompt == peer) {
      state = state.copyWith(clearVideoPrompt: true);
    }
    if (state.video && !state.cameraOn && !_anyPeerVideo()) {
      state = state.copyWith(video: false);
    }
  }

  /// A new offer on a live link (our camera changed what it carries).
  Future<void> _renegotiate(String callId, String peer) async {
    final media = _media;
    if (media == null || !media.peers.contains(peer)) return;
    _renegotiating.add(peer);
    try {
      final offer = await media.createOfferFor(peer);
      await ref.read(callSignalSenderProvider)(callId, offer, to: peer);
    } on Object {
      _renegotiating.remove(peer);
    }
  }

  /// Perfect negotiation: of two members the one with the smaller user id
  /// is polite — in a clash of offers it gives way.
  bool _politeTo(String peer) {
    final me = _me;
    return me == null || me.compareTo(peer) < 0;
  }

  Future<void> switchCamera() async {
    if (!state.video) return;
    try {
      await _media?.switchCamera();
    } on Object {
      // A single camera.
    }
  }

  Future<void> toggleSpeaker() async {
    final on = !state.speaker;
    state = state.copyWith(speaker: on);
    try {
      await _media?.setSpeaker(on);
    } on Object {
      // Audio route unavailable: keep the flag for the UI.
    }
  }

  /// «Join» on the light invitation of a call from a group chat.
  /// Returns the API error code, or null when it worked.
  Future<String?> joinInvite(CallInvite invite) async {
    ref.read(callInviteProvider.notifier).set(null);
    if (state.busy) {
      ref.read(callOpenRequestProvider.notifier).bump();
      return null;
    }
    try {
      final call = await _repo.get(invite.callId);
      if (!call.live) return 'CALL_STATE_CONFLICT';
      return await joinGroupCall(
        call,
        peer: CallPeer(
          id: invite.groupId ?? call.id,
          isAttorney: false,
          displayName: invite.title.isNotEmpty ? invite.title : invite.who,
        ),
      );
    } on ApiException catch (e) {
      return e.code;
    } on Object {
      return 'ERROR';
    }
  }

  /// A ring that arrived by push / the system call UI (app was in the
  /// background): load it and show it here.
  Future<void> ringFromPush(String callId, {bool accept = false}) async {
    callTrace('ringFromPush $callId accept=$accept phase=${state.phase} '
        'current=${state.call?.id}');
    if (state.busy && state.call?.id != callId) {
      // Talking already: the system ring for this one must go, and the
      // caller hears it was declined (busy).
      unawaited(ref.read(systemCallUiProvider).dismiss(callId));
      unawaited(
        _repo.decline(callId).then<void>((_) {}, onError: (Object _) {}),
      );
      return;
    }
    try {
      if (state.call?.id != callId) {
        final call = await _getWithRetry(callId);
        if (!_ringsHere(call)) {
          // Push 2026-10-19: the call ended while the phone was asleep — a
          // system call screen answered (or still ringing) for it must go,
          // or CallKit keeps a call that never connects.
          unawaited(ref.read(systemCallUiProvider).dismiss(callId));
          return;
        }
        if (state.busy) {
          // The socket rang it (or another call began) meanwhile.
          if (state.call?.id != callId) {
            unawaited(ref.read(systemCallUiProvider).dismiss(callId));
            unawaited(
              _repo.decline(callId).then<void>((_) {}, onError: (Object _) {}),
            );
            return;
          }
        } else {
          _ring(call, showSystemUi: false);
        }
      }
      if (accept) await this.accept();
    } on Object catch (e) {
      // Still unreachable after the retries: take the system call down.
      callTrace('ringFromPush $callId failed: $e');
      unawaited(ref.read(systemCallUiProvider).dismiss(callId));
    }
  }

  /// The call rings on this phone: a plain call that is ringing, or a
  /// running group call we were added to and have not answered.
  bool _ringsHere(AppCall call) {
    if (call.outgoing) return false;
    if (call.status == CallStatus.ringing) return true;
    final me = _me;
    return call.status == CallStatus.active &&
        call.group &&
        me != null &&
        call.participants.any((m) => m.userId == me && m.ringing);
  }

  /// The network may not be awake yet when "Accept" is tapped in the
  /// system call UI: a few tries before giving up.
  Future<AppCall> _getWithRetry(String callId) async {
    Object? last;
    for (var i = 0; i < 4; i++) {
      try {
        return await _repo.get(callId);
      } on ApiException catch (e) {
        // A real answer (gone, not allowed): no point in retrying.
        if (e.statusCode != null && e.statusCode! < 500) rethrow;
        last = e;
      } on Object catch (e) {
        last = e;
      }
      await Future<void>.delayed(const Duration(milliseconds: 1500));
    }
    if (last is Exception) throw last;
    throw StateError('call unreachable');
  }

  // --- Internals -----------------------------------------------------------

  /// The call being answered right now (see [accept]).
  String? _accepting;

  void _ring(AppCall call, {bool showSystemUi = true}) {
    callTrace('ring ${call.id} systemUi=$showSystemUi '
        'lifecycle=${WidgetsBinding.instance.lifecycleState}');
    _reset();
    state = CallSession(
      phase: CallPhase.incoming,
      call: call,
      peer: call.peer,
      video: call.video,
      speaker: call.video,
    );
    // The caller's "ended" push / socket event may never arrive (no network,
    // Doze): ask the server now and then, and stop on our own a little after
    // the caller's own timeout — the ringtone never rings on forever.
    _ringTimer = Timer(kCallRingTimeout + kCallRingGrace, () {
      if (state.phase != CallPhase.incoming) return;
      final id = state.call?.id;
      if (id != null) unawaited(ref.read(systemCallUiProvider).dismiss(id));
      _finish(CallStatus.missed);
    });
    _startSync();
    // While it rings, get the relay list ready: answering connects faster.
    unawaited(_iceServers().then<void>((_) {}, onError: (Object _) {}));
    // Owner 2026-10-02: "Calls" off in Settings → the call still comes
    // (the in-app screen), but without the ringing system UI or a buzz.
    // Owner 2026-10-21: and so do the muted calls of this chat / group.
    if (callRingMuted(
      ref,
      conversationId: call.conversationId,
      groupId: call.groupId,
    )) {
      return;
    }
    unawaited(HapticFeedback.heavyImpact());
    // Audit 2026-10-02: with the app open Android's call screen needs the
    // notifications permission to ring (often not granted) — the app plays
    // the phone's own ringtone and shows its own incoming screen. iOS
    // CallKit rings with the phone's ringtone in the foreground too
    // (owner 2026-10-07: device sounds only), and in the background the
    // system call screen rings on both (push / callkit).
    final foreground =
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    final android = !kIsWeb && defaultTargetPlatform == TargetPlatform.android;
    if (kIsWeb) {
      // Web: no system call screen — the open tab rings and shows its own.
      unawaited(ref.read(appSoundsProvider).startRingtone());
      return;
    }
    // Owner 2026-10-21 (WhatsApp): one ringing surface. The phone's own call
    // sheet rings, also with the app open; the in-app strip stays away for
    // it. Only a phone that forbids notifications (the sheet cannot show)
    // gets the strip and the app's own ringtone.
    ref.read(systemRingingCallProvider.notifier).set(call.id);
    if (showSystemUi) {
      unawaited(ref.read(systemCallUiProvider).showIncoming(call));
    }
    if (android && foreground) {
      unawaited(() async {
        final shown = await ref.read(systemNotificationsProvider).enabled();
        if (shown || !ref.mounted || state.call?.id != call.id) return;
        if (state.phase != CallPhase.incoming) return;
        ref.read(systemRingingCallProvider.notifier).set(null);
        await ref.read(appSoundsProvider).startRingtone();
      }());
    }
  }

  Future<void> _openMedia(
    String callId, {
    bool video = false,
    String peer = '',
  }) async {
    if (_mediaOpen) return;
    final gen = _gen;
    final servers = await _iceServers();
    if (gen != _gen || !ref.mounted) return;
    final media = ref.read(callMediaFactoryProvider)();
    _media = media;
    _startedVideo = video;
    await media.open(
      servers,
      video: video,
      peer: peer,
      onSignal: (s) => ref.read(callSignalSenderProvider)(
        callId,
        s,
        to: peer.isEmpty ? null : peer,
      ),
      onState: (s) => _onLinkState(peer, s),
    );
    if (gen != _gen) {
      // The call ended while the mic was being asked for.
      unawaited(media.close());
      return;
    }
    _mediaOpen = true;
    // The other side may hang up while this phone has no socket (app in the
    // background, Doze): ask the server now and then, so the call and its
    // ringing/ongoing UI never outlive it.
    _startSync();
    _watchNetwork();
    _turnTimer?.cancel();
    _turnTimer = Timer.periodic(kCallTurnRefresh, (_) {
      unawaited(_refreshTurn());
    });
  }

  /// Takes a fresh TURN login into the running links and re-routes through it
  /// (the old login would stop working when its hours run out).
  Future<void> _refreshTurn() async {
    final media = _media;
    if (media == null || !state.busy) return;
    try {
      _ice = null;
      final servers = await _iceServers();
      await media.updateIceServers(servers);
      await _restartAll();
    } on Object {
      // The next round (or the next network change) tries again.
    }
  }

  /// The phone changed network (Wi-Fi ↔ 4G) or lost it: the old routes may
  /// be dead long before the library notices, so look for new ones now.
  void _watchNetwork() {
    unawaited(_netSub?.cancel());
    try {
      _netSub = ref.read(networkInterfaceMonitorProvider).changes.listen(
        (up) {
          if (!up) return;
          _netTimer?.cancel();
          _netTimer = Timer(kCallNetworkSettle, () {
            if (ref.mounted && state.busy) unawaited(_restartAll());
          });
        },
        onError: (Object _) {},
      );
    } on Object {
      // No platform monitor (tests, web): the link states decide.
    }
  }

  /// A new route for every link: the side that offered restarts ICE, the
  /// other asks it to.
  Future<void> _restartAll() async {
    final media = _media;
    if (media == null || !state.busy) return;
    for (final p in media.peers.toList()) {
      await _restartOrAsk(p);
    }
  }

  Future<void> _restartOrAsk(String peer) async {
    if (_offered.contains(peer)) return _restartIce(peer);
    final call = state.call;
    if (call == null || !state.busy) return;
    try {
      await ref.read(callSignalSenderProvider)(
        call.id,
        const {'type': 'restart'},
        to: peer,
      );
    } on Object {
      // The retry timer asks again.
    }
  }

  void _startSync() {
    _syncTimer?.cancel();
    _syncTimer = Timer.periodic(kCallSyncInterval, (_) {
      final id = state.call?.id;
      if (id != null && state.busy) unawaited(_resync(id));
    });
  }

  void _onLinkState(String peer, CallMediaState s) {
    if (!ref.mounted) return;
    switch (s) {
      case CallMediaState.connected:
        _connected.add(peer);
        _stopReconnect(peer);
        if (state.phase != CallPhase.active && state.phase != CallPhase.ended) {
          _connectTimer?.cancel();
          state = state.copyWith(
            phase: CallPhase.active,
            connectedAt: DateTime.now(),
          );
        }
      case CallMediaState.disconnected:
        // A short blip often heals by itself; a longer one is retried.
        _connected.remove(peer);
        if (state.phase == CallPhase.active) _startReconnect(peer);
        _askServer();
      case CallMediaState.failed:
        _connected.remove(peer);
        _askServer();
        if (state.phase == CallPhase.active) {
          _startReconnect(peer);
        } else if (state.busy) {
          _linkLost(peer);
        }
      case CallMediaState.connecting:
        break;
    }
  }

  /// A link dropped: the other side may simply have hung up, so ask the
  /// server at once — if the call is over it closes now, not after the
  /// reconnect timeout.
  void _askServer() {
    final id = state.call?.id;
    if (id != null && state.busy) unawaited(_resync(id));
  }

  /// A link is gone for good. In a group the others go on (the next member
  /// list sets the link up again); alone with them, the call ends.
  void _linkLost(String peer) {
    if (!state.busy) return;
    final media = _media;
    final others = media == null
        ? const <String>[]
        : [
            for (final p in media.peers)
              if (p != peer && _connected.contains(p)) p,
          ];
    if (state.call?.group ?? false) {
      // A channel's call goes on with nobody else in it (Telegram).
      if (others.isNotEmpty || state.call?.channelId != null) {
        _forgetLink(peer);
        unawaited(media?.removePeer(peer));
        return;
      }
    }
    unawaited(hangUp(reason: CallEndReason.failed));
  }

  /// The audio link to [peer] dropped mid-call: show "Reconnecting…", let
  /// the offering side restart ICE every few seconds, give the link up only
  /// when the grace runs out.
  void _startReconnect(String peer) {
    if (_reconnect.containsKey(peer)) return;
    _reconnect[peer] = (
      grace: Timer(kCallReconnectGrace, () {
        _reconnect.remove(peer)?.retry.cancel();
        _syncReconnecting();
        if (state.busy) _linkLost(peer);
      }),
      retry: Timer.periodic(kCallReconnectRetry, (_) {
        _askServer();
        unawaited(_restartOrAsk(peer));
      }),
    );
    _syncReconnecting();
    unawaited(_restartOrAsk(peer));
  }

  void _stopReconnect(String peer) {
    final r = _reconnect.remove(peer);
    if (r == null) return;
    r.grace.cancel();
    r.retry.cancel();
    _syncReconnecting();
  }

  /// "Reconnecting…" shows while no link carries the call.
  void _syncReconnecting() {
    if (!ref.mounted) return;
    final on = _reconnect.isNotEmpty && _connected.isEmpty;
    if (state.reconnecting != on) state = state.copyWith(reconnecting: on);
  }

  /// Only the side that offered the link restarts it; the other answers.
  Future<void> _restartIce(String peer) async {
    final call = state.call;
    final media = _media;
    if (call == null ||
        media == null ||
        !_offered.contains(peer) ||
        !media.peers.contains(peer) ||
        !state.busy) {
      return;
    }
    try {
      final offer = await media.restartIceFor(peer);
      await ref.read(callSignalSenderProvider)(call.id, offer, to: peer);
    } on Object {
      // The grace timer decides.
    }
  }

  /// getUserMedia refused: the user (or the OS) denied the microphone.
  static bool _isMicDenied(Object e) {
    final m = e.toString().toLowerCase();
    return m.contains('permission') || m.contains('notallowed');
  }

  void _armConnectTimeout() {
    _connectTimer?.cancel();
    _connectTimer = Timer(kCallConnectTimeout, () {
      if (state.phase != CallPhase.connecting) return;
      // A group call is a room: one member whose media never arrives (their
      // app is dead, no network) must not end it for the person who is in
      // it — they stay in, the others can still connect (device test
      // 2026-10-20: the call closed itself after 25 s). Only a two-person
      // call that never connects fails.
      if (state.call?.group ?? false) {
        state = state.copyWith(
          phase: CallPhase.active,
          connectedAt: DateTime.now(),
        );
        return;
      }
      unawaited(hangUp(reason: CallEndReason.failed));
    });
  }

  Future<void> _onSignal(Map<String, Object?> data, {String? from}) async {
    final media = _media;
    final call = state.call;
    // Before pick-up (or before the mic is open) keep it for later.
    if (media == null ||
        !_mediaOpen ||
        call == null ||
        state.phase == CallPhase.incoming) {
      _earlySignals.add((from: from, data: data));
      return;
    }
    final peer = from ?? call.peer.id;
    try {
      switch (data['type']) {
        case 'offer':
          _signalSeen = true;
          // A member we have no link with yet: they joined after us.
          if (!media.peers.contains(peer)) await _addLink(call.id, peer);
          // Owner 2026-10-22 (perfect negotiation): both sides offered at
          // once — two cameras switched on together, or a camera and an ICE
          // restart. The polite side (the smaller user id) takes its own
          // offer back and answers theirs; the other ignores the offer that
          // came (its own gets answered).
          var rolledBack = false;
          if (await media.offerPendingFor(peer)) {
            if (!_politeTo(peer)) return;
            try {
              await media.rollbackFor(peer);
            } on Object {
              // Cannot take it back: wait for their answer instead.
              return;
            }
            rolledBack = true;
          }
          final answer = await media.answerFor(peer, data);
          await ref.read(callSignalSenderProvider)(call.id, answer, to: peer);
          // The offer we took back carried a camera change: send it again.
          if (rolledBack && _renegotiating.remove(peer)) {
            unawaited(_renegotiate(call.id, peer));
          }
        case 'answer':
          if (!_offered.contains(peer) && !_renegotiating.contains(peer)) {
            return;
          }
          _signalSeen = true;
          _renegotiating.remove(peer);
          await media.setAnswerFor(peer, data);
        case 'candidate':
          if (media.peers.contains(peer)) {
            await media.addCandidateFor(peer, data);
          }
        case 'camera':
          ref
              .read(callCamerasOffProvider.notifier)
              .set(peer, on: data['on'] != false);
          // Owner 2026-10-22: no camera left on on either side — the
          // voice layout (WhatsApp).
          if (data['on'] == false &&
              state.video &&
              !state.cameraOn &&
              !_anyPeerVideo()) {
            state = state.copyWith(video: false);
          }
        case 'video':
          _onPeerVideo(peer, on: data['on'] != false);
        case 'restart':
          // The side that answered lost the route: the offerer renews it.
          if (_offered.contains(peer)) await _restartIce(peer);
      }
    } on Object {
      _linkLost(peer);
    }
  }

  void _onEvent(RealtimeEvent e) {
    final data = e.data;
    switch (e.name) {
      case 'call:incoming':
        final call = CallMappers.fromEvent(data);
        // While in another call the server's sweep marks this one missed.
        if (call == null || state.busy) return;
        // OQ-048: an assistant rings only with the "calls" duty.
        if (!ref.read(canDoProvider(AssistantDuty.calls))) return;
        _ring(call);
      case 'call:invite':
        final call = CallMappers.fromEvent(data);
        if (call == null || state.busy) return;
        if (!ref.read(canDoProvider(AssistantDuty.calls))) return;
        ref.read(callInviteProvider.notifier).set(
              CallInvite(
                callId: call.id,
                groupId: call.groupId,
                who: call.peer.displayName ?? '',
                video: call.video,
              ),
            );
      case 'call:accepted':
        final call = CallMappers.fromEvent(data);
        if (call == null || call.id != state.call?.id) return;
        if (call.outgoing && state.phase == CallPhase.outgoing) {
          _ringTimer?.cancel();
          unawaited(ref.read(appSoundsProvider).stopRingback());
          state = state.copyWith(phase: CallPhase.connecting, call: call);
          _armConnectTimeout();
          unawaited(_sendOffer(call));
          unawaited(_nudgeSignals(call.id));
        } else if (!call.outgoing && state.phase == CallPhase.incoming) {
          // Picked up on another of our devices.
          unawaited(ref.read(systemCallUiProvider).dismiss(call.id));
          _reset();
          state = const CallSession();
        }
      case 'call:ended':
        final call = CallMappers.fromEvent(data);
        // The «Join» row of a call that is over goes at once (inbox 20).
        if (call != null && ref.read(callInviteProvider)?.callId == call.id) {
          ref.read(callInviteProvider.notifier).set(null);
        }
        if (call == null || call.id != state.call?.id) return;
        unawaited(ref.read(systemCallUiProvider).dismiss(call.id));
        if (state.phase != CallPhase.ended) _finish(call.status, call: call);
      case 'call:signal':
        if (data is! Map || data['callId'] != state.call?.id) return;
        final payload = data['data'];
        if (payload is Map) {
          final from = data['from'];
          unawaited(
            _onSignal(
              Map<String, Object?>.from(payload),
              from: from is String ? from : null,
            ),
          );
        }
      case 'call:participants':
        final m = CallMappers.participantsFromEvent(data);
        if (m == null || m.callId != state.call?.id || !state.busy) return;
        _applyMembers(m.hostId, m.members);
      case 'call:vote':
        final v = CallMappers.voteFromEvent(data);
        final call = state.call;
        if (v == null || call == null || v.callId != call.id || !state.busy) {
          return;
        }
        state = state.copyWith(
          call: call.copyWith(vote: v.vote, clearVote: v.vote == null),
          notice: switch (v.result) {
            'passed' => '$kNoticeVotePassed:${v.targetId}',
            'failed' => '$kNoticeVoteFailed:${v.targetId}',
            _ => null,
          },
        );
      case 'call:muted':
        if (data is! Map || data['callId'] != state.call?.id) return;
        if (data['muted'] == true && state.busy) {
          _media?.setMuted(true);
          state = state.copyWith(muted: true, notice: kNoticeMutedByHost);
        }
      case 'call:removed':
        if (data is! Map || data['callId'] != state.call?.id) return;
        _removedFromCall();
      case RealtimeEvent.reconnected:
        final id = state.call?.id;
        if (id != null && state.busy) {
          unawaited(_resync(id));
          // The socket came back: the network changed (Wi-Fi ↔ LTE) — the
          // old media routes may be dead without any link state change yet.
          unawaited(_restartAll());
        }
    }
  }

  /// Device test 2026-10-21 (Samsung → locked iPhone, answered on the
  /// CallKit screen): the offer / answer went to the server while the
  /// phone's socket was not yet in its room, and signalling is never stored
  /// — the call rang on for ever. Until one has come through, renew the
  /// route now and then: the offerer sends a fresh offer, the answerer asks
  /// for one.
  Future<void> _nudgeSignals(String callId) async {
    final gen = _gen;
    for (var i = 0; i < 6; i++) {
      await Future<void>.delayed(const Duration(seconds: 3));
      if (!ref.mounted ||
          gen != _gen ||
          _signalSeen ||
          state.call?.id != callId ||
          state.phase != CallPhase.connecting) {
        return;
      }
      await _restartAll();
    }
  }

  Future<void> _sendOffer(AppCall call) => _offerTo(call.id, call.peer.id);

  /// A "call over" push (the socket may be asleep): the server decides.
  /// Also closes the system call (CallKit) that outlived it.
  Future<void> remoteEnded(String callId) async {
    if (state.busy && state.call?.id == callId) {
      await _resync(callId);
    }
    if (!state.busy || state.call?.id != callId) {
      unawaited(ref.read(systemCallUiProvider).dismiss(callId));
    }
  }

  /// After a socket drop: the server knows whether the call still lives.
  Future<void> _resync(String callId) async {
    try {
      final call = await _repo.get(callId);
      // A late answer about call A must not end the new call B.
      if (state.call?.id != callId) return;
      if (!call.live && state.busy) {
        _finish(call.status, call: call);
        return;
      }
      // The server let us go while the call lives (our heartbeat was missed
      // for a long while): back in, so the call does not go on as a ghost.
      final me = _me;
      final mine = me == null
          ? null
          : call.participants.where((m) => m.userId == me).firstOrNull;
      if (call.group &&
          (call.groupId != null || call.channelId != null) &&
          state.phase == CallPhase.active &&
          (mine == null || !mine.joined) &&
          mine?.status != CallMemberStatus.invited) {
        final back = await _repo.join(callId);
        if (state.call?.id == callId) _applyCall(back);
      }
    } on Object {
      // Keep going; the next event decides.
    }
  }

  Future<void> _endQuietly(
    String callId,
    CallEndReason reason, {
    bool forAll = false,
  }) async {
    // The request must get through even when the network is out for a
    // while (owner 2026-10-20: a hung-up video call stayed "live" on the
    // server): retried with growing pauses for about a minute, and it keeps
    // going after this controller is gone. The server's own watchdog closes
    // a silent call as the last resort.
    final repo = _repo;
    for (var i = 0; i < 9; i++) {
      try {
        await repo.end(callId, reason, forAll: forAll);
        return;
      } on ApiException catch (e) {
        final code = e.statusCode;
        if (code != null && code < 500 && code != 408 && code != 429) return;
      } on Object {
        // Offline: try again.
      }
      await Future<void>.delayed(Duration(seconds: i < 4 ? 1 << i : 8));
    }
  }

  /// The ringing screen goes away and the ongoing-call notification (with
  /// the microphone service) takes its place, one after the other.
  Future<void> _swapToOngoing(AppCall call) async {
    await ref.read(systemCallUiProvider).answered(call);
  }

  void _finish(CallStatus outcome, {AppCall? call, bool keepOpen = false}) {
    final wasCalling = state.busy;
    final endedId = call?.id ?? state.call?.id;
    callTrace('finish $endedId outcome=$outcome phase=${state.phase} '
        'error=${state.errorCode}');
    if (endedId != null) {
      final ui = ref.read(systemCallUiProvider);
      unawaited(ui.dismiss(endedId).then<void>((_) => ui.endAll()));
      // Device test 2026-10-21: after a group call «Leave» the ongoing-call
      // notification (7003) and the plugin's records stayed in the shade.
      // The end is stated outright, not left to the state listener, and
      // again a moment later for a start that was still in flight.
      final fg = ref.read(callForegroundProvider);
      _fgKey = null;
      unawaited(fg.stop());
      unawaited(
        Future<void>.delayed(const Duration(seconds: 2), () async {
          if (ref.mounted && !state.busy) {
            await fg.stop();
            await ui.endAll();
          }
        }),
      );
    }
    _reset();
    // OQ-044: "busy" beeps, or the short end-of-call tone.
    final sounds = ref.read(appSoundsProvider);
    if (outcome == CallStatus.busy) {
      unawaited(sounds.busy());
    } else if (wasCalling) {
      unawaited(sounds.callEnded());
    } else {
      unawaited(sounds.stopRingback());
    }
    if (!ref.mounted) return;
    state = state.copyWith(
      phase: CallPhase.ended,
      outcome: outcome,
      call: call,
      reconnecting: false,
    );
    // The 409 sheet decides when this screen goes.
    if (keepOpen) return;
    _linger = Timer(kCallEndedLinger, () {
      if (ref.mounted && state.phase == CallPhase.ended) {
        state = const CallSession();
      }
    });
  }

  void _reset() {
    _gen++;
    ref.read(callCamerasOffProvider.notifier).clear();
    _accepting = null;
    _clearTimers();
    // Audit 2026-10-02: the incoming melody stops with any change.
    unawaited(ref.read(appSoundsProvider).stopRingtone());
    unawaited(_media?.close());
    _media = null;
    _mediaOpen = false;
    _earlySignals.clear();
    _offered.clear();
    _renegotiating.clear();
    _videoPeers.clear();
    _startedVideo = false;
    _signalSeen = false;
    _connected.clear();
    _syncAgain = false;
  }

  void _clearTimers() {
    _turnTimer?.cancel();
    _turnTimer = null;
    _netTimer?.cancel();
    _netTimer = null;
    unawaited(_netSub?.cancel());
    _netSub = null;
    _ringTimer?.cancel();
    _connectTimer?.cancel();
    _syncTimer?.cancel();
    for (final r in _reconnect.values) {
      r.grace.cancel();
      r.retry.cancel();
    }
    _reconnect.clear();
    _linger?.cancel();
  }
}

/// Owner 2026-10-05: video calls are on (the bootstrap turns the flag off
/// while TURN is not configured, so the button never leads nowhere).
final videoCallsEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled('video_calls'),
);

/// Owner 2026-10-21: the group call this person left but that may still be
/// running — the app offers a way back (WhatsApp).
@immutable
class GroupRejoin {
  const GroupRejoin({
    required this.groupId,
    required this.title,
    this.callId,
    this.avatarUrl,
  });

  /// The chat group whose call it is; null for a call made a group by
  /// adding people — then [callId] says which.
  final String? groupId;
  final String? callId;
  final String title;
  final String? avatarUrl;
}

class GroupRejoinNotifier extends Notifier<GroupRejoin?> {
  @override
  GroupRejoin? build() => null;

  // ignore: use_setters_to_change_properties
  void set(GroupRejoin? value) => state = value;
}

final groupRejoinProvider = NotifierProvider<GroupRejoinNotifier, GroupRejoin?>(
  GroupRejoinNotifier.new,
);

/// Owner 2026-10-21 (Telegram): a call started in a group chat, or an
/// invitation into it, is a light prompt — «X · Join» — not a ringing call.
@immutable
class CallInvite {
  const CallInvite({
    required this.callId,
    required this.who,
    this.groupId,
    this.title = '',
    this.video = false,
  });

  final String callId;
  final String? groupId;

  /// Who started the call / invited us.
  final String who;

  /// The group's name (empty when unknown).
  final String title;
  final bool video;
}

class CallInviteNotifier extends Notifier<CallInvite?> {
  @override
  CallInvite? build() => null;

  // ignore: use_setters_to_change_properties
  void set(CallInvite? value) => state = value;
}

final callInviteProvider =
    NotifierProvider<CallInviteNotifier, CallInvite?>(CallInviteNotifier.new);

final callControllerProvider =
    NotifierProvider<CallController, CallSession>(CallController.new);
