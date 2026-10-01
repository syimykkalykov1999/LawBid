import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/audio/app_sounds.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/data/calls_repository.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/realtime_client.dart';
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
  });

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
      );
}

/// Sends a signaling payload to the other member of [callId].
typedef CallSignalSender = Future<bool> Function(
    String callId, Map<String, Object?> data);

final callSignalSenderProvider = Provider<CallSignalSender>((ref) {
  return (callId, data) async =>
      await ref.read(realtimeClientProvider)?.callSignal(callId, data) ?? false;
});

/// The phone's own ringing UI (CallKit / ConnectionService); a no-op in
/// tests and where the plugin is missing.
abstract interface class SystemCallUi {
  Future<void> showIncoming(AppCall call);
  Future<void> dismiss(String callId);
}

class NoSystemCallUi implements SystemCallUi {
  const NoSystemCallUi();

  @override
  Future<void> showIncoming(AppCall call) async {}

  @override
  Future<void> dismiss(String callId) async {}
}

/// The real one (CallKit) is set in `CallHost`'s scope by the app;
/// tests keep the no-op.
final systemCallUiProvider =
    Provider<SystemCallUi>((ref) => const NoSystemCallUi());

/// The caller gives up after this — about six rings (owner 2026-09-30);
/// the server marks a forgotten call missed a little later.
const kCallRingTimeout = Duration(seconds: 30);

/// The link must come up this fast after pick-up, else "failed".
const kCallConnectTimeout = Duration(seconds: 25);

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
  Timer? _linger;
  final _earlySignals = <Map<String, Object?>>[];
  bool _mediaOpen = false;

  CallsRepository get _repo => ref.read(callsRepositoryProvider);

  @override
  CallSession build() {
    _events?.cancel();
    _events = ref.watch(realtimeEventsProvider).listen(_onEvent);
    ref.onDispose(() {
      _events?.cancel();
      _clearTimers();
      unawaited(_media?.close());
    });
    return const CallSession();
  }

  // --- Outgoing ------------------------------------------------------------

  /// Calls the other member of [conversationId].
  Future<void> call(String conversationId, {CallPeer? peer}) async {
    if (state.busy) return;
    _reset();
    state = CallSession(phase: CallPhase.outgoing, peer: peer);
    try {
      final call = await _repo.start(conversationId);
      if (!ref.mounted) return;
      if (call.status == CallStatus.busy) {
        _finish(call.status, call: call);
        return;
      }
      state = state.copyWith(call: call, peer: call.peer);
      // OQ-044: the caller hears ringback tones while it rings there.
      unawaited(ref.read(appSoundsProvider).startRingback());
      // Mic + connection ready while it rings: pick-up connects faster.
      await _openMedia(call.id);
      _ringTimer = Timer(kCallRingTimeout, () {
        if (state.phase == CallPhase.outgoing) {
          unawaited(hangUp(reason: CallEndReason.noAnswer));
        }
      });
    } on ApiException catch (e) {
      state = state.copyWith(errorCode: e.code);
      _finish(CallStatus.failed);
    } on Object {
      final id = state.call?.id;
      _finish(CallStatus.failed);
      if (id != null) unawaited(_endQuietly(id, CallEndReason.failed));
    }
  }

  // --- Incoming ------------------------------------------------------------

  Future<void> accept() async {
    final call = state.call;
    if (call == null || state.phase != CallPhase.incoming) return;
    state = state.copyWith(phase: CallPhase.connecting);
    unawaited(ref.read(systemCallUiProvider).dismiss(call.id));
    try {
      await _openMedia(call.id);
      final accepted = await _repo.accept(call.id);
      if (!ref.mounted) return;
      state = state.copyWith(call: accepted);
      _armConnectTimeout();
      // The caller's offer may already be here.
      final early = List.of(_earlySignals);
      _earlySignals.clear();
      for (final s in early) {
        await _onSignal(s);
      }
    } on ApiException catch (e) {
      state = state.copyWith(errorCode: e.code);
      _finish(CallStatus.failed);
    } on Object {
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
    _finish(switch (reason) {
      CallEndReason.noAnswer => CallStatus.missed,
      CallEndReason.failed => CallStatus.failed,
      CallEndReason.hangup =>
        wasActive ? CallStatus.ended : CallStatus.canceled,
    });
    if (call != null) await _endQuietly(call.id, reason);
  }

  void toggleMute() {
    final muted = !state.muted;
    _media?.setMuted(muted);
    state = state.copyWith(muted: muted);
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
    if (state.busy && state.call?.id != callId) return;
    try {
      if (state.call?.id != callId) {
        final call = await _repo.get(callId);
        if (call.status != CallStatus.ringing || call.outgoing) return;
        _ring(call, showSystemUi: false);
      }
      if (accept) await this.accept();
    } on Object {
      // Gone already.
    }
  }

  // --- Internals -----------------------------------------------------------

  void _ring(AppCall call, {bool showSystemUi = true}) {
    _reset();
    state = CallSession(phase: CallPhase.incoming, call: call, peer: call.peer);
    unawaited(HapticFeedback.heavyImpact());
    if (showSystemUi) {
      unawaited(ref.read(systemCallUiProvider).showIncoming(call));
    }
  }

  Future<void> _openMedia(String callId) async {
    if (_mediaOpen) return;
    final servers = await _repo.iceServers();
    final media = ref.read(callMediaFactoryProvider)();
    _media = media;
    await media.open(
      servers,
      onSignal: (s) => ref.read(callSignalSenderProvider)(callId, s),
      onState: (s) {
        if (!ref.mounted) return;
        if (s == CallMediaState.connected &&
            state.phase != CallPhase.active &&
            state.phase != CallPhase.ended) {
          _connectTimer?.cancel();
          state = state.copyWith(
              phase: CallPhase.active, connectedAt: DateTime.now());
        } else if (s == CallMediaState.failed && state.busy) {
          unawaited(hangUp(reason: CallEndReason.failed));
        }
      },
    );
    _mediaOpen = true;
  }

  void _armConnectTimeout() {
    _connectTimer?.cancel();
    _connectTimer = Timer(kCallConnectTimeout, () {
      if (state.phase == CallPhase.connecting) {
        unawaited(hangUp(reason: CallEndReason.failed));
      }
    });
  }

  Future<void> _onSignal(Map<String, Object?> data) async {
    final media = _media;
    final call = state.call;
    // Before pick-up (or before the mic is open) keep it for later.
    if (media == null ||
        !_mediaOpen ||
        call == null ||
        state.phase == CallPhase.incoming) {
      _earlySignals.add(data);
      return;
    }
    try {
      switch (data['type']) {
        case 'offer':
          if (call.outgoing) return;
          final answer = await media.answer(data);
          await ref.read(callSignalSenderProvider)(call.id, answer);
        case 'answer':
          if (!call.outgoing) return;
          await media.setAnswer(data);
        case 'candidate':
          await media.addCandidate(data);
      }
    } on Object {
      if (state.busy) unawaited(hangUp(reason: CallEndReason.failed));
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
          unawaited(_sendOffer(call.id));
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
          unawaited(_onSignal(Map<String, Object?>.from(payload)));
        }
      case RealtimeEvent.reconnected:
        final id = state.call?.id;
        if (id != null && state.busy) unawaited(_resync(id));
    }
  }

  Future<void> _sendOffer(String callId) async {
    try {
      final offer = await _media!.createOffer();
      final ok = await ref.read(callSignalSenderProvider)(callId, offer);
      if (!ok) throw StateError('signal refused');
    } on Object {
      if (state.busy) unawaited(hangUp(reason: CallEndReason.failed));
    }
  }

  /// After a socket drop: the server knows whether the call still lives.
  Future<void> _resync(String callId) async {
    try {
      final call = await _repo.get(callId);
      if (!call.live && state.busy) _finish(call.status, call: call);
    } on Object {
      // Keep going; the next event decides.
    }
  }

  Future<void> _endQuietly(String callId, CallEndReason reason) async {
    try {
      await _repo.end(callId, reason);
    } on Object {
      // The server's sweep closes it.
    }
  }

  void _finish(CallStatus outcome, {AppCall? call}) {
    final wasCalling = state.busy;
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
    );
    _linger = Timer(kCallEndedLinger, () {
      if (ref.mounted && state.phase == CallPhase.ended) {
        state = const CallSession();
      }
    });
  }

  void _reset() {
    _clearTimers();
    unawaited(_media?.close());
    _media = null;
    _mediaOpen = false;
    _earlySignals.clear();
  }

  void _clearTimers() {
    _ringTimer?.cancel();
    _connectTimer?.cancel();
    _linger?.cancel();
  }
}

final callControllerProvider =
    NotifierProvider<CallController, CallSession>(CallController.new);
