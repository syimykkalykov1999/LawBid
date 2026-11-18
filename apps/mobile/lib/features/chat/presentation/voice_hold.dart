import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';
import 'package:lawbid/features/chat/domain/hold_gesture.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:material_ui/material_ui.dart';

/// The round button of a composer (send, mic): gold when [on].
typedef ComposerCircle = Widget Function({
  required IconData icon,
  required bool on,
  required String label,
  double scale,
});

/// OQ-040 hold-to-record, shared by the 1:1 composer and the group
/// composer (groups WhatsApp parity): hold the mic to record, slide left to
/// cancel, slide up to lock and keep recording hands-free, release (or Send
/// when locked) to send; pause / play back / resume while locked; a call
/// or leaving the chat closes the note into a draft that waits under
/// [voiceDraftKey]. The recorder takes the owner's admin quality settings
/// ([voiceQualityOf]). Moved here unchanged from the 1:1 `_ComposerState`.
mixin VoiceHoldRecorder<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  /// The chat id: a recording left unsent waits under it.
  String get voiceDraftKey;

  /// A finished note to send.
  Future<void> sendVoiceRecording(VoiceRecording r);

  /// «recording a voice message…» (`voice: true`) or stopped (`false`).
  // ignore: avoid_positional_boolean_parameters
  void voiceTyping(bool active, {bool voice = false});

  bool _recording = false;
  bool _locked = false;

  /// Lock mode: recording paused (the bars freeze, preview is offered).
  bool _paused = false;

  /// The finished file: a recording left here earlier, or the paused note
  /// once it was played back (a resume is no longer possible then — the
  /// file is closed).
  VoiceRecording? _held;

  /// The finger is on the mic. Starting the recorder takes a moment; a
  /// quick tap may lift the finger before it runs — then nothing records.
  bool _pressed = false;
  Offset _drag = Offset.zero;

  /// A start is in flight: a second press must not start the recorder again
  /// (owner inbox 32: that reset the clock and the bars mid-note).
  bool _starting = false;

  /// «recording a voice message…» pings (no rebuilds: the clock and the
  /// bars of the strip tick by themselves).
  Timer? _tick;

  /// The length shown while paused or for a held draft.
  Duration _elapsed = Duration.zero;

  // Owned by the composer: lives exactly as long as the chat screen.
  final VoiceRecorder _rec = VoiceRecorder();
  late final VoiceDrafts _drafts;
  late final VoicePlayer _player;

  /// A note is being recorded, is paused or waits as a draft.
  bool get voiceRecording => _recording;

  /// Hands-free (slid up): Send instead of releasing.
  bool get voiceLocked => _locked;

  /// From initState: a recording left here (call came in, screen left) is
  /// back, paused.
  void voiceInit() {
    // Resolved now: dispose cannot read providers.
    _drafts = ref.read(voiceDraftsProvider.notifier);
    _player = ref.read(voicePlayerProvider.notifier);
    final draft = _drafts.of(voiceDraftKey);
    if (draft != null) {
      _held = draft;
      _recording = true;
      _locked = true;
      _paused = true;
      _elapsed = Duration(milliseconds: draft.durationMs);
    }
  }

  /// From dispose (before super.dispose).
  void voiceDispose() {
    _tick?.cancel();
    unawaited(_player.stopDraft());
    unawaited(_saveDraft());
  }

  /// From build: a ringing or started call closes the note into a draft.
  void voiceWatchCalls() {
    ref.listen(callControllerProvider.select((c) => c.phase), (_, phase) {
      if (phase != CallPhase.idle) unawaited(_onCall());
    });
  }

  /// Leaving the chat or a call coming in must not throw a recording away:
  /// it is closed into a file and waits in the composer.
  Future<void> _saveDraft() async {
    if (!_recording) {
      await _rec.dispose();
      return;
    }
    var r = _held;
    if (r == null && _rec.recording) {
      r = await _rec.stop();
    }
    if (r != null) {
      _drafts.put(voiceDraftKey, r);
    } else if (_rec.recording) {
      await _rec.cancel();
    }
    await _rec.dispose();
  }

  bool get _callBusy => _player.callBusy;

  /// A call rings or starts while recording: the microphone belongs to the
  /// call. The note is closed into a paused draft the user can send later.
  Future<void> _onCall() async {
    if (!_recording || _held != null) return;
    _tick?.cancel();
    final r = await _rec.stop();
    if (!mounted) return;
    if (r == null) {
      setState(_reset);
      return;
    }
    setState(() {
      _held = r;
      _locked = true;
      _paused = true;
      _elapsed = Duration(milliseconds: r.durationMs);
    });
  }

  Future<void> _start() async {
    if (_starting || _recording) return;
    _starting = true;
    try {
      await _startRecording();
    } finally {
      _starting = false;
    }
  }

  Future<void> _startRecording() async {
    final t = ref.read(translatorProvider);
    if (_callBusy) {
      showAppSnackBar(context, t.t('chat.voice.duringCall'));
      return;
    }
    // One note at a time: stop whatever is playing.
    unawaited(_player.stop());
    // ignore: unawaited_futures
    AppHaptics.medium();
    // The buzz is over before the microphone opens, so it is not recorded.
    await Future<void>.delayed(const Duration(milliseconds: 130));
    if (!mounted) return;
    final ok = await _rec.start(
      onCap: () => _finish(send: true),
      quality: voiceQualityOf(ref.read(featureFlagsControllerProvider)),
    );
    if (!mounted) {
      // Left the chat while the recorder started: close the microphone.
      if (ok) unawaited(_rec.cancel());
      return;
    }
    if (!ok) {
      // Sweep C-c12 W7: in a browser the permission lives in the site
      // settings, not the phone's (Telegram Web / WhatsApp Web).
      showAppSnackBar(
        context,
        t.t(kIsWeb ? 'chat.voice.noMicWeb' : 'chat.voice.noMic'),
      );
      return;
    }
    if (!_pressed) {
      // Released before the recorder started: a tap, not a hold.
      await _rec.cancel();
      if (mounted) showAppSnackBar(context, t.t('chat.voice.hold'));
      return;
    }
    _pingTyping();
    setState(() {
      _recording = true;
      _locked = false;
      _paused = false;
      _drag = Offset.zero;
      _elapsed = Duration.zero;
    });
  }

  void _pingTyping() {
    _tick?.cancel();
    // Owner 2026-10-20: the other side sees «recording a voice
    // message…» (re-sent every ~2 s; it fades 5 s after the last one).
    voiceTyping(true, voice: true);
    _tick = Timer.periodic(const Duration(seconds: 2), (_) {
      if (mounted) voiceTyping(true, voice: true);
    });
  }

  /// Back to an empty composer.
  void _reset() {
    if (_recording) voiceTyping(false);
    _drafts.clear(voiceDraftKey);
    _held = null;
    _recording = false;
    _locked = false;
    _paused = false;
    _drag = Offset.zero;
  }

  Future<void> _finish({required bool send}) async {
    if (!_recording) return;
    _tick?.cancel();
    await _player.stop();
    // Leaving the chat saves the note as a draft (dispose); nothing to do.
    if (!mounted) return;
    final held = _held;
    setState(_reset);
    if (!send) {
      // ignore: unawaited_futures
      AppHaptics.light();
      if (held != null) {
        await deleteVoiceFile(held.path);
      } else {
        await _rec.cancel();
      }
      return;
    }
    final r = held ?? await _rec.stop();
    if (!mounted) return;
    if (r == null) {
      showAppSnackBar(
        context,
        ref.read(translatorProvider).t('chat.voice.hold'),
      );
      return;
    }
    // ignore: unawaited_futures
    AppHaptics.light();
    await sendVoiceRecording(r);
  }

  /// Lock mode: pause — the bars freeze, play-back and resume appear.
  Future<void> _pauseRec() async {
    await _rec.pause();
    _tick?.cancel();
    if (!mounted) return;
    setState(() {
      _paused = true;
      _elapsed = _rec.elapsed;
    });
  }

  Future<void> _resumeRec() async {
    if (_held != null) return;
    await _player.stop();
    await _rec.resume();
    if (!mounted) return;
    _pingTyping();
    setState(() => _paused = false);
  }

  /// Plays the paused note (closes the file the first time) through the
  /// app's one voice player: same fades, never two sounds at once.
  Future<void> _togglePreview() async {
    if (_callBusy) {
      showAppSnackBar(
        context,
        ref.read(translatorProvider).t('chat.voice.duringCall'),
      );
      return;
    }
    final r = _held ?? await _rec.stop();
    if (!mounted) return;
    if (r == null) {
      showAppSnackBar(
        context,
        ref.read(translatorProvider).t('chat.voice.hold'),
      );
      return;
    }
    setState(() => _held = r);
    await _player.toggleLocal(r.path, r.durationMs);
  }

  Future<void> _seekPreview(double f) async {
    final h = _held;
    if (h == null) return;
    final playback = ref.read(voicePlayerProvider);
    if (playback.messageId != kVoiceDraftId) await _togglePreview();
    await _player.seekTo(Duration(milliseconds: (h.durationMs * f).round()));
  }

  /// Locked: Send.
  Future<void> voiceSendLocked() async {
    final h = _held;
    if (h == null) return _finish(send: true);
    _tick?.cancel();
    await _player.stop();
    if (!mounted) return;
    setState(_reset);
    // ignore: unawaited_futures
    AppHaptics.light();
    await sendVoiceRecording(h);
  }

  void _onMove(PointerMoveEvent e) {
    if (!_recording || _locked) return;
    setState(() => _drag += e.delta);
    switch (HoldGesture.classify(_drag)) {
      case HoldOutcome.cancel:
        unawaited(_finish(send: false));
      case HoldOutcome.lock:
        // No buzz here: the microphone is open and would record it.
        setState(() => _locked = true);
      case HoldOutcome.none:
        break;
    }
  }

  /// From build: the strip that takes the field's place while recording
  /// (clock, bars, slide-to-cancel; pause / preview / resume when locked).
  Widget voiceRecordingBar() {
    final playback = ref.watch(voicePlayerProvider);
    final onDraft = playback.messageId == kVoiceDraftId;
    final previewPlaying = onDraft && playback.playing;
    final previewAt = onDraft ? playback.position : Duration.zero;
    return VoiceRecordingBar(
      source: _rec,
      locked: _locked,
      paused: _paused,
      pausedAt: previewAt > Duration.zero ? previewAt : _elapsed,
      previewPlaying: previewPlaying,
      waveform: _held?.waveform ?? _rec.waveformNow,
      progress: _held == null || _held!.durationMs == 0
          ? 0
          : previewAt.inMilliseconds / _held!.durationMs,
      onSeek: _held == null ? null : _seekPreview,
      slideOpacity: HoldGesture.slideOpacity(_drag),
      onCancel: () => _finish(send: false),
      onTogglePreview: _togglePreview,
      onPause: _pauseRec,
      onResume: _held == null ? _resumeRec : null,
    );
  }

  /// From build: the hold-to-record mic; a lock hint floats above it.
  Widget voiceMic({
    required ComposerCircle circle,
    required String label,
  }) =>
      VoiceHoldMic(
        recording: _recording,
        locked: _locked,
        drag: _drag,
        circle: circle,
        label: label,
        onDown: () {
          _pressed = true;
          unawaited(_start());
        },
        onMove: _onMove,
        onUp: () {
          _pressed = false;
          if (!_locked) unawaited(_finish(send: true));
        },
        onCancel: () {
          _pressed = false;
          if (!_locked) unawaited(_finish(send: false));
        },
      );
}

/// The mic of [VoiceHoldRecorder]: the pointer goes straight to the hold
/// gesture (down = record, up = send, cancel = drop), the button follows a
/// slide to the left and grows while recording, the lock hint fades in on
/// a slide up.
class VoiceHoldMic extends StatelessWidget {
  const VoiceHoldMic({
    required this.recording,
    required this.locked,
    required this.drag,
    required this.circle,
    required this.label,
    required this.onDown,
    required this.onMove,
    required this.onUp,
    required this.onCancel,
    super.key,
  });

  final bool recording;
  final bool locked;
  final Offset drag;
  final ComposerCircle circle;
  final String label;
  final VoidCallback onDown;
  final void Function(PointerMoveEvent e) onMove;
  final VoidCallback onUp;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Stack(
      clipBehavior: Clip.none,
      alignment: Alignment.bottomCenter,
      children: [
        if (recording)
          Positioned(
            bottom: AppSizes.touchTarget + 16,
            child: Opacity(
              opacity: HoldGesture.lockHintOpacity(drag),
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  border: Border.all(color: colors.border),
                ),
                child: AppIcon(
                  AppIcons.lockOutlineRounded,
                  size: 18,
                  color: colors.iconTint,
                ),
              ),
            ),
          ),
        Listener(
          onPointerDown: (_) => onDown(),
          onPointerMove: onMove,
          onPointerUp: (_) => onUp(),
          onPointerCancel: (_) => onCancel(),
          child: Transform.translate(
            offset: recording && !locked
                ? Offset(math.min(0, drag.dx) * 0.5, 0)
                : Offset.zero,
            child: circle(
              icon: AppIcons.micRounded,
              on: true,
              label: label,
              scale: recording ? 1.25 : 1,
            ),
          ),
        ),
      ],
    );
  }
}
