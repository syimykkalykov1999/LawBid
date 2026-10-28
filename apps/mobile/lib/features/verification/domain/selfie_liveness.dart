import 'dart:math' as math;
import 'dart:ui' show Offset, Rect, Size;

import 'package:flutter/foundation.dart' show immutable;

/// Owner 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md):
/// the guided "selfie with your ID" camera. Pure logic, no camera and no
/// ML Kit here — the screen feeds it what the on-device detector saw in a
/// frame and draws what it returns, so every rule is unit-tested with fake
/// detector input.
///
/// Forgiving on purpose (owner: attorneys must not fight the oval): the
/// face may sit anywhere within ~25 % of the oval's centre and in a wide
/// size range, the ID card is a soft hint (after [SelfieLivenessConfig.
/// cardSoftGate] the shot is allowed without it), there is ONE random
/// liveness prompt, auto-capture follows ~1 s after everything holds, and
/// after [SelfieLivenessConfig.fallbackAfter] a "Take photo anyway" button
/// appears (still the live camera; flagged for the verifier).

/// The one random liveness prompt of a session.
enum LivenessChallenge {
  blink,
  turnLeft,
  turnRight;

  String get wire => switch (this) {
        blink => 'blink',
        turnLeft => 'turn_left',
        turnRight => 'turn_right',
      };

  static LivenessChallenge random([math.Random? rng]) =>
      values[(rng ?? math.Random.secure()).nextInt(values.length)];
}

/// What the attorney is told right now (one short line).
enum SelfieHint {
  starting,
  noFace,
  multipleFaces,
  moreLight,
  moveCloser,
  moveBack,
  centerFace,
  blink,
  turnLeft,
  turnRight,
  showId,
  holdStill,
}

/// Colour of the oval: neutral (no face) → active (a face, not ready yet)
/// → ready (green: face + liveness + card or its grace time).
enum OvalTone { neutral, active, ready }

/// How the selfie's liveness ended, as sent to the server.
enum LivenessResult {
  /// The random prompt was done on the live camera.
  passed,

  /// No face detector on this device: a manual shot with the overlay.
  notChecked,

  /// «Take photo anyway» after the timeout (still the live camera).
  skipped;

  String get wire => switch (this) {
        passed => 'passed',
        notChecked => 'not_checked',
        skipped => 'skipped',
      };
}

/// One face found in a frame, in SCREEN coordinates normalized to 0..1
/// (the preview fills the screen), plus ML Kit's classification.
@immutable
class FaceSample {
  const FaceSample({
    required this.box,
    this.leftEyeOpen,
    this.rightEyeOpen,
    this.yaw,
  });

  final Rect box;
  final double? leftEyeOpen;
  final double? rightEyeOpen;

  /// Head turn (ML Kit headEulerAngleY), degrees.
  final double? yaw;
}

/// What the detector saw in one processed frame.
@immutable
class FrameSignals {
  const FrameSignals({
    required this.faces,
    this.brightness,
    this.cardText,
  });

  final List<FaceSample> faces;

  /// Mean luma 0..255 of the frame (sampled), or null when unknown.
  final double? brightness;

  /// true = text found where an ID card is held; null = not looked for in
  /// this frame (text recognition runs less often than face detection).
  final bool? cardText;
}

/// Where the face oval and the ID-card frame are drawn — one place for the
/// painter and for the machine's tolerance checks. Portrait phone: the
/// oval left of centre, the card frame beside it at chin height (the
/// preview is mirrored, so a card in the right hand appears on the right).
@immutable
class SelfieGuideLayout {
  const SelfieGuideLayout(this.screen);

  final Size screen;

  static const double _ovalCenterX = 0.36;
  static const double _ovalCenterY = 0.40;
  static const double _ovalWidth = 0.50;
  static const double _ovalAspect = 1.3;
  static const double _cardRatio = 1.586; // ISO/IEC 7810 ID-1
  static const double _gap = 0.03;

  Rect get oval {
    final w = screen.width * _ovalWidth;
    final h = math.min(w * _ovalAspect, screen.height * 0.42);
    return Rect.fromCenter(
      center: Offset(screen.width * _ovalCenterX, screen.height * _ovalCenterY),
      width: w,
      height: h,
    );
  }

  Rect get card {
    final o = oval;
    final left = o.right + screen.width * _gap;
    final w = screen.width * (1 - _gap) - left;
    final h = w / _cardRatio;
    return Rect.fromLTWH(left, o.center.dy + o.height * 0.12 - h / 2, w, h);
  }

  /// [oval] normalized to 0..1 of the screen.
  Rect get ovalNormalized => Rect.fromLTRB(
        oval.left / screen.width,
        oval.top / screen.height,
        oval.right / screen.width,
        oval.bottom / screen.height,
      );

  SelfieLivenessConfig config() {
    final o = ovalNormalized;
    return SelfieLivenessConfig(
      ovalCenter: o.center,
      ovalWidth: o.width,
      ovalHeight: o.height,
    );
  }
}

@immutable
class SelfieLivenessConfig {
  const SelfieLivenessConfig({
    this.ovalCenter = const Offset(0.36, 0.40),
    this.ovalWidth = 0.50,
    this.ovalHeight = 0.30,
    this.centerTolerance = 0.25,
    this.minFaceToOval = 0.40,
    this.maxFaceToOval = 1.45,
    this.minBrightness = 55,
    this.eyeOpen = 0.6,
    this.eyeClosed = 0.4,
    this.turnDegrees = 18,
    this.backToCenterDegrees = 10,
    this.cardSoftGate = const Duration(seconds: 4),
    this.holdBeforeCapture = const Duration(milliseconds: 900),
    this.fallbackAfter = const Duration(seconds: 9),
  });

  /// Oval in normalized screen coordinates (width/height as fractions of
  /// the screen's width/height). Must match the painted overlay.
  final Offset ovalCenter;
  final double ovalWidth;
  final double ovalHeight;

  /// Face centre may be this fraction of the oval's size off its centre.
  final double centerTolerance;

  /// Face box height / oval height accepted range.
  final double minFaceToOval;
  final double maxFaceToOval;
  final double minBrightness;

  /// Average eye-open probability above which the eyes count as open,
  /// below [eyeClosed] as closed (community thresholds; fast blinks are
  /// missed with stricter ones).
  final double eyeOpen;
  final double eyeClosed;
  final double turnDegrees;
  final double backToCenterDegrees;

  /// Without a card seen, the shot is allowed this long after the camera
  /// opened (the card check is a hint, not a gate).
  final Duration cardSoftGate;

  /// Everything must hold this long before the auto-capture.
  final Duration holdBeforeCapture;

  /// «Take photo anyway» appears after this.
  final Duration fallbackAfter;
}

/// What the screen draws. Equal views mean nothing to redraw.
@immutable
class SelfieLivenessView {
  const SelfieLivenessView({
    required this.hint,
    required this.tone,
    required this.challenge,
    required this.challengeDone,
    required this.faceInOval,
    required this.cardDetected,
    required this.canCapture,
    required this.showFallback,
    required this.holdProgress,
  });

  final SelfieHint hint;
  final OvalTone tone;
  final LivenessChallenge challenge;
  final bool challengeDone;
  final bool faceInOval;
  final bool cardDetected;

  /// The shutter is enabled (face in the oval + liveness done).
  final bool canCapture;

  /// The «Take photo anyway» button is shown.
  final bool showFallback;

  /// 0..1 of [SelfieLivenessConfig.holdBeforeCapture]; 1 = capture now.
  final double holdProgress;

  bool get autoCaptureDue => holdProgress >= 1;

  @override
  bool operator ==(Object other) =>
      other is SelfieLivenessView &&
      other.hint == hint &&
      other.tone == tone &&
      other.challenge == challenge &&
      other.challengeDone == challengeDone &&
      other.faceInOval == faceInOval &&
      other.cardDetected == cardDetected &&
      other.canCapture == canCapture &&
      other.showFallback == showFallback &&
      other.holdProgress == holdProgress;

  @override
  int get hashCode => Object.hash(
        hint,
        tone,
        challenge,
        challengeDone,
        faceInOval,
        cardDetected,
        canCapture,
        showFallback,
        holdProgress,
      );
}

/// The state machine. Feed it [add] for each processed frame and [tick]
/// from a timer (timers must advance even when no frame arrives).
class SelfieLivenessMachine {
  SelfieLivenessMachine({
    required this.challenge,
    this.config = const SelfieLivenessConfig(),
  });

  final LivenessChallenge challenge;
  final SelfieLivenessConfig config;

  bool _sawOpen = false;
  bool _sawClosed = false;
  bool _turned = false;
  bool _challengeDone = false;
  bool? _turnMatched;
  bool _cardDetected = false;
  bool _faceEverInOval = false;
  bool _faceInOval = false;
  SelfieHint _faceHint = SelfieHint.starting;
  Duration? _holdSince;
  Duration _now = Duration.zero;

  bool get challengeDone => _challengeDone;
  bool get cardDetected => _cardDetected;
  bool get faceDetected => _faceEverInOval;

  /// For a head-turn prompt: whether the turn went the asked way (the
  /// front camera's mirroring differs per platform, so either way passes).
  bool? get turnMatched => _turnMatched;

  SelfieLivenessView get view => _view();

  SelfieLivenessView add(FrameSignals s, Duration now) {
    _now = now;
    if (s.cardText ?? false) _cardDetected = true;
    _faceInOval = false;
    // Too dark is said only while no face is found (its likely cause); a
    // face the detector sees is good enough.
    final dark = s.brightness != null && s.brightness! < config.minBrightness;
    if (s.faces.isEmpty) {
      _faceHint = dark ? SelfieHint.moreLight : SelfieHint.noFace;
    } else if (s.faces.length > 1) {
      _faceHint = SelfieHint.multipleFaces;
    } else {
      final f = s.faces.single;
      final placement = _placement(f.box);
      if (placement != null) {
        _faceHint = placement;
      } else {
        _faceInOval = true;
        _faceEverInOval = true;
        _faceHint = SelfieHint.holdStill;
        _trackChallenge(f);
      }
    }
    return _view();
  }

  SelfieLivenessView tick(Duration now) {
    _now = now;
    return _view();
  }

  /// null = in the oval; otherwise what to say.
  SelfieHint? _placement(Rect box) {
    final c = config;
    final dx = (box.center.dx - c.ovalCenter.dx) / c.ovalWidth;
    final dy = (box.center.dy - c.ovalCenter.dy) / c.ovalHeight;
    final size = box.height / c.ovalHeight;
    if (size < c.minFaceToOval) return SelfieHint.moveCloser;
    if (size > c.maxFaceToOval) return SelfieHint.moveBack;
    if (dx.abs() > c.centerTolerance || dy.abs() > c.centerTolerance) {
      return SelfieHint.centerFace;
    }
    return null;
  }

  void _trackChallenge(FaceSample f) {
    if (_challengeDone) return;
    final c = config;
    switch (challenge) {
      case LivenessChallenge.blink:
        final l = f.leftEyeOpen;
        final r = f.rightEyeOpen;
        if (l == null || r == null) return;
        final avg = (l + r) / 2;
        if (avg >= c.eyeOpen) {
          if (_sawClosed) {
            _challengeDone = true;
          } else {
            _sawOpen = true;
          }
        } else if (avg <= c.eyeClosed && _sawOpen) {
          _sawClosed = true;
        }
      case LivenessChallenge.turnLeft:
      case LivenessChallenge.turnRight:
        final yaw = f.yaw;
        if (yaw == null) return;
        if (!_turned && yaw.abs() >= c.turnDegrees) {
          _turned = true;
          // ML Kit: positive Y = the head turned to its left (unmirrored).
          final left = yaw > 0;
          _turnMatched = left == (challenge == LivenessChallenge.turnLeft);
        } else if (_turned && yaw.abs() <= c.backToCenterDegrees) {
          // Back to the camera: the kept frame is a frontal face.
          _challengeDone = true;
        }
    }
  }

  SelfieLivenessView _view() {
    final c = config;
    final canCapture = _faceInOval && _challengeDone;
    final cardOk = _cardDetected || _now >= c.cardSoftGate;
    final ready = canCapture && cardOk && _faceHint == SelfieHint.holdStill;
    if (ready) {
      _holdSince ??= _now;
    } else {
      _holdSince = null;
    }
    final held = _holdSince == null ? Duration.zero : _now - _holdSince!;
    final progress = ready
        ? (held.inMicroseconds / c.holdBeforeCapture.inMicroseconds)
            .clamp(0.0, 1.0)
        : 0.0;
    final SelfieHint hint;
    if (!_faceInOval || _faceHint != SelfieHint.holdStill) {
      hint = _faceHint;
    } else if (!_challengeDone) {
      hint = switch (challenge) {
        LivenessChallenge.blink => SelfieHint.blink,
        LivenessChallenge.turnLeft => SelfieHint.turnLeft,
        LivenessChallenge.turnRight => SelfieHint.turnRight,
      };
    } else if (!cardOk) {
      hint = SelfieHint.showId;
    } else {
      hint = SelfieHint.holdStill;
    }
    return SelfieLivenessView(
      hint: hint,
      tone: ready
          ? OvalTone.ready
          : (_faceInOval ? OvalTone.active : OvalTone.neutral),
      challenge: challenge,
      challengeDone: _challengeDone,
      faceInOval: _faceInOval,
      cardDetected: _cardDetected,
      canCapture: canCapture,
      showFallback: _now >= c.fallbackAfter,
      holdProgress: progress,
    );
  }
}

/// What the guided camera reports with the selfie (sent as captureMeta;
/// the verifier reads it as a hint, never as proof).
@immutable
class SelfieCaptureReport {
  const SelfieCaptureReport({
    required this.liveness,
    required this.faceDetected,
    required this.cardDetected,
    required this.framesCaptured,
    required this.startedAt,
    required this.capturedAt,
    required this.platform,
    this.challenge,
    this.fallbackReason,
    this.deviceModel,
  });

  final LivenessResult liveness;
  final LivenessChallenge? challenge;

  /// 'timeout' | 'detector_unavailable' when liveness did not pass.
  final String? fallbackReason;
  final bool faceDetected;
  final bool cardDetected;
  final int framesCaptured;
  final DateTime startedAt;
  final DateTime capturedAt;

  /// 'android' | 'ios' | 'web'.
  final String platform;
  final String? deviceModel;
}
