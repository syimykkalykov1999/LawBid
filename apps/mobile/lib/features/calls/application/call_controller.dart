import 'dart:async';

import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart'
    show NotifCategory;
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
  });

  /// Group calls: something the screen tells the person for a moment
  /// ([kNoticeMutedByHost]).
  final String? notice;

  /// Owner 2026-10-05: a video call; [cameraOn] = our camera is sending.
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
    bool? cameraOn,
    bool? reconnecting,
    String? notice,
    bool clearNotice = false,
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
        video: video,
        cameraOn: cameraOn ?? this.cameraOn,
        reconnecting: reconnecting ?? this.reconnecting,
        notice: clearNotice ? null : notice ?? this.notice,
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

final callSignalSenderProvider = Provider<CallSignalSender>((ref) {
  return (callId, data, {to}) async =>
      await ref
          .read(realtimeClientProvider)
          ?.callSignal(callId, data, to: to) ??
      false;
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
}

/// The real one (CallKit) is set in `CallHost`'s scope by the app;
/// tests keep the no-op.
final systemCallUiProvider =
    Provider<SystemCallUi>((ref) => const NoSystemCallUi());

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

/// The link must come up this fast after pick-up, else "failed".
const kCallConnectTimeout = Duration(seconds: 25);

/// While a call lives, its state is re-read from the server this often (a
/// missed `call:ended` must not leave the other phone ringing or talking).
const kCallSyncInterval = Duration(seconds: 8);

/// An incoming ring stops by itself this long after the caller's timeout.
const kCallRingGrace = Duration(seconds: 10);

/// A dropped link gets this long to come back (new Wi-Fi / 4G network)
/// before the call ends; the caller restarts ICE every few seconds.
const kCallReconnectGrace = Duration(seconds: 60);
const kCallReconnectRetry = Duration(seconds: 6);

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
  final _earlySignals = <({String? from, Map<String, Object?> data})>[];
  bool _mediaOpen = false;

  // Per-member links (a two-person call has one).
  final _offered = <String>{};
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
    final gen = _gen;
    unawaited(ref.read(appSoundsProvider).stopRingtone());
    if (!await ref.read(callMicPermissionProvider)()) {
      // Cannot talk: decline, so the caller is not left waiting.
      if (!ref.mounted || state.call?.id != call.id) return;
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
      final accepted = await acceptF;
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
    } on ApiException catch (e) {
      if (gen != _gen) return;
      state = state.copyWith(errorCode: e.code);
      _finish(CallStatus.failed);
    } on Object catch (e) {
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
  Future<void> hangUp({CallEndReason reason = CallEndReason.hangup}) async {
    final call = state.call;
    final wasActive = state.phase == CallPhase.active;
    // The server hears it first: the media closing sends the other phone a
    // "link lost" before anything else, and it must not beat the hang-up
    // (it showed "Reconnecting…" for seconds on a video call).
    final ending = call == null ? null : _endQuietly(call.id, reason);
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
    _connected.remove(peer);
    _stopReconnect(peer);
  }

  /// The host removed us.
  void _removedFromCall() {
    final call = state.call;
    if (call == null || !state.busy) return;
    state = state.copyWith(errorCode: kRemovedFromCall);
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

  /// A ring that arrived by push / the system call UI (app was in the
  /// background): load it and show it here.
  Future<void> ringFromPush(String callId, {bool accept = false}) async {
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
    } on Object {
      // Still unreachable after the retries: take the system call down.
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

  void _ring(AppCall call, {bool showSystemUi = true}) {
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
    if (isCategoryMuted(ref, NotifCategory.calls)) return;
    unawaited(HapticFeedback.heavyImpact());
    // Audit 2026-10-02: with the app open Android's call screen needs the
    // notifications permission to ring (often not granted) — the app plays
    // the phone's own ringtone and shows its own incoming screen. iOS
    // CallKit rings with the phone's ringtone in the foreground too
    // (owner 2026-10-07: device sounds only), and in the background the
    // system call screen rings on both (push / callkit).
    final foreground =
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    // Web: no system call screen — the open tab rings and shows its own.
    if (kIsWeb ||
        (foreground && defaultTargetPlatform == TargetPlatform.android)) {
      unawaited(ref.read(appSoundsProvider).startRingtone());
    } else if (showSystemUi) {
      unawaited(ref.read(systemCallUiProvider).showIncoming(call));
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
      if (others.isNotEmpty) {
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
        unawaited(_restartIce(peer));
      }),
    );
    _syncReconnecting();
    unawaited(_restartIce(peer));
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
      if (state.phase == CallPhase.connecting) {
        unawaited(hangUp(reason: CallEndReason.failed));
      }
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
          // A member we have no link with yet: they joined after us.
          if (!media.peers.contains(peer)) await _addLink(call.id, peer);
          final answer = await media.answerFor(peer, data);
          await ref.read(callSignalSenderProvider)(call.id, answer, to: peer);
        case 'answer':
          if (!_offered.contains(peer)) return;
          await media.setAnswerFor(peer, data);
        case 'candidate':
          if (media.peers.contains(peer)) {
            await media.addCandidateFor(peer, data);
          }
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
      case 'call:accepted':
        final call = CallMappers.fromEvent(data);
        if (call == null || call.id != state.call?.id) return;
        if (call.outgoing && state.phase == CallPhase.outgoing) {
          _ringTimer?.cancel();
          unawaited(ref.read(appSoundsProvider).stopRingback());
          state = state.copyWith(phase: CallPhase.connecting, call: call);
          _armConnectTimeout();
          unawaited(_sendOffer(call));
        } else if (!call.outgoing && state.phase == CallPhase.incoming) {
          // Picked up on another of our devices.
          unawaited(ref.read(systemCallUiProvider).dismiss(call.id));
          _reset();
          state = const CallSession();
        }
      case 'call:ended':
        final call = CallMappers.fromEvent(data);
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
          for (final p in _offered.toList()) {
            unawaited(_restartIce(p));
          }
        }
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
          call.groupId != null &&
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

  Future<void> _endQuietly(String callId, CallEndReason reason) async {
    // The request must get through even when the network is out for a
    // while (owner 2026-10-20: a hung-up video call stayed "live" on the
    // server): retried with growing pauses for about a minute, and it keeps
    // going after this controller is gone. The server's own watchdog closes
    // a silent call as the last resort.
    final repo = _repo;
    for (var i = 0; i < 9; i++) {
      try {
        await repo.end(callId, reason);
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
    if (endedId != null) {
      unawaited(ref.read(systemCallUiProvider).dismiss(endedId));
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
    _clearTimers();
    // Audit 2026-10-02: the incoming melody stops with any change.
    unawaited(ref.read(appSoundsProvider).stopRingtone());
    unawaited(_media?.close());
    _media = null;
    _mediaOpen = false;
    _earlySignals.clear();
    _offered.clear();
    _connected.clear();
    _syncAgain = false;
  }

  void _clearTimers() {
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

final callControllerProvider =
    NotifierProvider<CallController, CallSession>(CallController.new);
