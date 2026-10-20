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
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart'
    show NotifCategory;
import 'package:lawbid/features/social/application/social_providers.dart'
    show currentUserIdProvider;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

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
        video: video,
        cameraOn: cameraOn ?? this.cameraOn,
        reconnecting: reconnecting ?? this.reconnecting,
        notice: clearNotice ? null : notice ?? this.notice,
      );
}

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

/// A dropped link gets this long to come back (new Wi-Fi / 4G network)
/// before the call ends; the caller restarts ICE every few seconds.
const kCallReconnectGrace = Duration(seconds: 30);
const kCallReconnectRetry = Duration(seconds: 6);

/// How long the "Call ended" screen stays.
const kCallEndedLinger = Duration(milliseconds: 1600);

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

  String? get _me => ref.read(currentUserIdProvider);

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
    final name = _callLabel(next);
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

  /// Who the call is with: the other person, or the first two names and a
  /// count for a group.
  String _callLabel(CallSession s) {
    final call = s.call;
    final me = _me;
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
      // Mic + connection ready while it rings: pick-up connects faster.
      await _openMedia(call.id, video: call.video, peer: call.peer.id);
      if (gen != _gen) return;
      _ringTimer = Timer(kCallRingTimeout, () {
        if (state.phase == CallPhase.outgoing) {
          unawaited(hangUp(reason: CallEndReason.noAnswer));
        }
      });
    } on ApiException catch (e) {
      if (gen != _gen) return;
      state = state.copyWith(errorCode: e.code);
      _finish(CallStatus.failed);
    } on Object catch (e) {
      if (gen != _gen) return;
      final id = state.call?.id;
      if (_isMicDenied(e)) state = state.copyWith(errorCode: kMicDenied);
      _finish(CallStatus.failed);
      if (id != null) unawaited(_endQuietly(id, CallEndReason.failed));
    }
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
    _finish(
      switch (reason) {
        CallEndReason.noAnswer => CallStatus.missed,
        CallEndReason.failed => CallStatus.failed,
        CallEndReason.hangup =>
          wasActive ? CallStatus.ended : CallStatus.canceled,
      },
    );
    if (call != null) await _endQuietly(call.id, reason);
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
        if (call.status != CallStatus.ringing || call.outgoing) {
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
      case CallMediaState.failed:
        _connected.remove(peer);
        if (state.phase == CallPhase.active) {
          _startReconnect(peer);
        } else if (state.busy) {
          _linkLost(peer);
        }
      case CallMediaState.connecting:
        break;
    }
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
        if (id != null && state.busy) unawaited(_resync(id));
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
      if (!call.live && state.busy) _finish(call.status, call: call);
    } on Object {
      // Keep going; the next event decides.
    }
  }

  Future<void> _endQuietly(String callId, CallEndReason reason) async {
    // A few tries: a lost request leaves the other phone ringing for a
    // minute. The server's sweep is the last resort.
    for (var i = 0; i < 3; i++) {
      try {
        await _repo.end(callId, reason);
        return;
      } on ApiException catch (e) {
        final code = e.statusCode;
        if (code != null && code < 500) return;
        await Future<void>.delayed(Duration(seconds: 1 + i));
      } on Object {
        await Future<void>.delayed(Duration(seconds: 1 + i));
      }
    }
  }

  /// The ringing screen goes away and the ongoing-call notification (with
  /// the microphone service) takes its place, one after the other.
  Future<void> _swapToOngoing(AppCall call) async {
    await ref.read(systemCallUiProvider).answered(call);
  }

  void _finish(CallStatus outcome, {AppCall? call}) {
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
