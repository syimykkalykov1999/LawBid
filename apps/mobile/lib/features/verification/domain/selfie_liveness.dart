import 'dart:math' as math;
import 'dart:ui' show Rect, Size;

import 'package:flutter/foundation.dart' show immutable;
import 'package:lawbid/features/verification/domain/selfie_guide.dart';

export 'package:lawbid/features/verification/domain/selfie_guide.dart';

/// Owner 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md):
/// the guided "selfie with your ID" camera. Pure logic, no camera and no
/// ML Kit here — the screen feeds it what the on-device detector saw in a
/// frame and draws what it returns, so every rule is unit-tested with fake
/// detector input.
///
/// Forgiving on purpose (owner: attorneys must not fight the oval): since
/// 2026-11-12 (row 62) the oval and the card frame are placed around the
/// face that is seen (any arm length works within a wide band), the ID
/// card is a soft hint (after [SelfieLivenessConfig.cardSoftGate] the shot
/// is allowed without it), there is ONE random liveness prompt,
/// auto-capture follows ~0.7 s after everything holds steady, and after
/// [SelfieLivenessConfig.fallbackAfter] a "Take photo anyway" button
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
  holdSteady,
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

/// Where the guide rests before a face is seen, in screen pixels, plus the
/// machine's config for this screen shape (one place for the painter and
/// for the checks). Portrait phone: the oval left of centre, the card frame
/// beside it at chin height (the preview is mirrored, so a card in the
/// right hand appears on the right). Once a face is found, the guide moves
/// to the face ([SelfieGuideGeometry.around]).
@immutable
class SelfieGuideLayout {
  const SelfieGuideLayout(this.screen);

  final Size screen;

  double get _aspect =>
      screen.width <= 0 ? 844 / 390 : screen.height / screen.width;

  SelfieGuideGeometry get geometry => SelfieGuideGeometry(aspect: _aspect);

  SelfieGuide get rest => geometry.rest();

  Rect get oval => rest.ovalOn(screen);

  Rect get card => rest.cardOn(screen);

  SelfieLivenessConfig config() => SelfieLivenessConfig(geometry: geometry);
}

@immutable
class SelfieLivenessConfig {
  const SelfieLivenessConfig({
    this.geometry = const SelfieGuideGeometry(),
    this.minFaceWidth = 0.22,
    this.maxFaceWidth = 0.46,
    this.sizeSlack = 0.03,
    this.minCenterY = 0.20,
    this.maxCenterY = 0.64,
    this.minCenterX = 0.15,
    this.maxCenterX = 0.85,
    this.centerSlack = 0.03,
    this.smoothing = 0.5,
    this.faceGrace = const Duration(milliseconds: 600),
    this.multipleFacesFrames = 2,
    this.secondFaceRatio = 0.5,
    this.steadyMove = 0.08,
    this.guideDeadband = 0.012,
    this.hintDwell = const Duration(milliseconds: 300),
    this.minBrightness = 55,
    this.eyeOpen = 0.6,
    this.eyeClosed = 0.4,
    this.turnDegrees = 18,
    this.backToCenterDegrees = 10,
    this.cardGrace = const Duration(milliseconds: 1800),
    this.cardSoftGate = const Duration(seconds: 5),
    this.holdBeforeCapture = const Duration(milliseconds: 700),
    this.fallbackAfter = const Duration(seconds: 9),
  });

  /// Where the guide goes for a face on this screen.
  final SelfieGuideGeometry geometry;

  /// Face box width as a fraction of the screen width: below = «move
  /// closer», above = «move back» (the card must still fit beside it).
  /// Once in place, each border gives [sizeSlack] more (hysteresis).
  final double minFaceWidth;
  final double maxFaceWidth;
  final double sizeSlack;

  /// The face centre must stay in this band (normalized), else «center
  /// your face»; [centerSlack] of hysteresis once in place.
  final double minCenterY;
  final double maxCenterY;
  final double minCenterX;
  final double maxCenterX;
  final double centerSlack;

  /// Weight of the newest face box in the running average (0..1).
  final double smoothing;

  /// A face missing for less than this still counts as there (ML Kit
  /// misses single frames; the guide must not blink).
  final Duration faceGrace;

  /// «Only one face» needs this many frames in a row.
  final int multipleFacesFrames;

  /// A second face smaller than this × the main one is ignored (the photo
  /// on the ID card the attorney holds).
  final double secondFaceRatio;

  /// Between two detections the face may move this fraction of its width
  /// (or change size by it) and still count as steady.
  final double steadyMove;

  /// The drawn guide follows the face only when an edge moved more than
  /// this (normalized), so it never trembles.
  final double guideDeadband;

  /// A new hint must be asked for this long before it is shown.
  final Duration hintDwell;
  final double minBrightness;

  /// Average eye-open probability above which the eyes count as open,
  /// below [eyeClosed] as closed (community thresholds; fast blinks are
  /// missed with stricter ones).
  final double eyeOpen;
  final double eyeClosed;
  final double turnDegrees;
  final double backToCenterDegrees;

  /// Card text seen this recently counts as «card in place» (text
  /// recognition runs less often than face detection).
  final Duration cardGrace;

  /// Without a card seen, the shot is allowed this long after the camera
  /// opened (the card check is a hint, not a gate).
  final Duration cardSoftGate;

  /// Everything must hold (and stay steady) this long before the
  /// auto-capture.
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
    this.guide,
  });

  final SelfieHint hint;
  final OvalTone tone;
  final LivenessChallenge challenge;
  final bool challengeDone;
  final bool faceInOval;

  /// The card is beside the face right now (its frame turns green).
  final bool cardDetected;

  /// The shutter is enabled (face in place + liveness done).
  final bool canCapture;

  /// The «Take photo anyway» button is shown.
  final bool showFallback;

  /// 0..1 of [SelfieLivenessConfig.holdBeforeCapture]; 1 = capture now.
  final double holdProgress;

  /// Where to draw the oval and the card frame (normalized); null = the
  /// rest layout of the screen.
  final SelfieGuide? guide;

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
      other.holdProgress == holdProgress &&
      other.guide == guide;

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
        guide,
      );
}

/// The state machine. Feed it [add] for each processed frame and [tick]
/// from a timer (timers must advance even when no frame arrives).
///
/// Owner 2026-11-12 (row 62): stable and adaptive.
/// - Face presence has a grace time ([SelfieLivenessConfig.faceGrace]):
///   one missed frame never blanks the guide; «only one face» needs two
///   frames and ignores the small face on the ID card.
/// - The face box is averaged over frames; the guide follows it with a
///   dead band, so it moves with the attorney instead of making them
///   match a fixed spot, and never trembles.
/// - Distance is judged by the face's width on screen, with hysteresis on
///   every border, so the hint does not flip on a border.
/// - Hints show only after [SelfieLivenessConfig.hintDwell].
/// - Auto-capture needs face + prompt + card (or its grace time) AND a
///   steady face for [SelfieLivenessConfig.holdBeforeCapture].
class SelfieLivenessMachine {
  SelfieLivenessMachine({
    required this.challenge,
    this.config = const SelfieLivenessConfig(),
  }) : _hint = Debounced(SelfieHint.starting, dwell: config.hintDwell);

  final LivenessChallenge challenge;
  final SelfieLivenessConfig config;

  bool _sawOpen = false;
  bool _sawClosed = false;
  bool _turned = false;
  bool _challengeDone = false;
  bool? _turnMatched;
  bool _cardDetected = false;
  Duration? _cardSeenAt;
  bool _faceEverInOval = false;

  Rect? _smooth;
  Rect? _lastRaw;
  Duration? _faceSeenAt;
  bool _dark = false;
  int _multiFrames = 0;
  bool _multi = false;
  bool _inPlace = false;
  bool _steady = false;
  SelfieHint _placementHint = SelfieHint.noFace;
  SelfieGuide? _guide;
  bool _cardFits = true;

  final Debounced<SelfieHint> _hint;

  /// A frame was processed (until then: «getting the camera ready»).
  bool _framed = false;
  Duration? _holdSince;
  Duration _now = Duration.zero;

  bool get challengeDone => _challengeDone;

  /// A card was seen at least once (reported to the verifier).
  bool get cardDetected => _cardDetected;
  bool get faceDetected => _faceEverInOval;

  /// For a head-turn prompt: whether the turn went the asked way (the
  /// front camera's mirroring differs per platform, so either way passes).
  bool? get turnMatched => _turnMatched;

  SelfieLivenessView get view => _view();

  bool get _facePresent =>
      _faceSeenAt != null && _now - _faceSeenAt! <= config.faceGrace;

  bool get _cardInPlace =>
      _cardSeenAt != null && _now - _cardSeenAt! <= config.cardGrace;

  SelfieLivenessView add(FrameSignals s, Duration now) {
    _now = now;
    _framed = true;
    if (s.cardText ?? false) {
      _cardDetected = true;
      _cardSeenAt = now;
    }
    _dark = s.brightness != null && s.brightness! < config.minBrightness;
    if (s.faces.isEmpty) {
      _multiFrames = 0;
      _multi = false;
      return _view();
    }
    final faces = [...s.faces]
      ..sort((a, b) => b.box.width.compareTo(a.box.width));
    final main = faces.first;
    final others = faces
        .skip(1)
        .where((f) => f.box.width >= main.box.width * config.secondFaceRatio)
        .length;
    _multiFrames = others > 0 ? _multiFrames + 1 : 0;
    _multi = _multiFrames >= config.multipleFacesFrames;
    final fresh = !_facePresent;
    _faceSeenAt = now;
    _track(main.box, fresh: fresh);
    if (_multi) return _view();
    _placementHint = _placement() ?? SelfieHint.holdStill;
    _inPlace = _placementHint == SelfieHint.holdStill;
    if (_inPlace) {
      _faceEverInOval = true;
      _trackChallenge(main);
    }
    return _view();
  }

  SelfieLivenessView tick(Duration now) {
    _now = now;
    return _view();
  }

  /// Steadiness from the raw box, the running average for placement and
  /// the guide. [fresh]: the face just (re)appeared — no average from an
  /// old spot.
  void _track(Rect raw, {required bool fresh}) {
    final last = fresh ? null : _lastRaw;
    if (last != null) {
      final w = math.max(last.width, 1e-6);
      final moved = (raw.center - last.center).distance / w;
      final grew = (raw.width - last.width).abs() / w;
      _steady = moved <= config.steadyMove && grew <= config.steadyMove;
    } else {
      _steady = false;
    }
    _lastRaw = raw;
    final prev = _smooth;
    final a = config.smoothing;
    _smooth = prev == null || fresh
        ? raw
        : Rect.fromLTRB(
            prev.left + (raw.left - prev.left) * a,
            prev.top + (raw.top - prev.top) * a,
            prev.right + (raw.right - prev.right) * a,
            prev.bottom + (raw.bottom - prev.bottom) * a,
          );
    final placed = config.geometry.around(
      _smooth!,
      preferRight: _guide?.cardOnRight,
    );
    _cardFits = placed.cardFits;
    final g = _guide;
    if (g == null || !g.near(placed.guide, config.guideDeadband)) {
      _guide = placed.guide;
    }
  }

  /// null = in place; otherwise what to say. Every border has hysteresis:
  /// once in place, it gives [SelfieLivenessConfig.sizeSlack] /
  /// [SelfieLivenessConfig.centerSlack] more before saying anything.
  SelfieHint? _placement() {
    final c = config;
    final b = _smooth!;
    final size = _inPlace ? c.sizeSlack : 0.0;
    final centre = _inPlace ? c.centerSlack : 0.0;
    if (b.width < c.minFaceWidth - size) return SelfieHint.moveCloser;
    if (b.width > c.maxFaceWidth + size) return SelfieHint.moveBack;
    final cx = b.center.dx;
    final cy = b.center.dy;
    if (cx < c.minCenterX - centre ||
        cx > c.maxCenterX + centre ||
        cy < c.minCenterY - centre ||
        cy > c.maxCenterY + centre) {
      return SelfieHint.centerFace;
    }
    // The card frame must fit beside the face: off to one side → centre
    // it; big and centred (no room either side) → move back.
    if (!_cardFits) {
      return (cx - 0.5).abs() < 0.12
          ? SelfieHint.moveBack
          : SelfieHint.centerFace;
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
    final present = _facePresent;
    if (!present) {
      // Gone for longer than the grace time: start over from the rest
      // layout (the next face is placed fresh).
      _inPlace = false;
      _steady = false;
      _lastRaw = null;
      _guide = null;
    }
    final inPlace = present && !_multi && _inPlace;
    final canCapture = inPlace && _challengeDone;
    final cardOk = _cardInPlace || _now >= c.cardSoftGate;
    final SelfieHint wanted;
    if (!_framed) {
      wanted = SelfieHint.starting;
    } else if (!present) {
      wanted = _dark ? SelfieHint.moreLight : SelfieHint.noFace;
    } else if (_multi) {
      wanted = SelfieHint.multipleFaces;
    } else if (!inPlace) {
      wanted = _placementHint;
    } else if (!_challengeDone) {
      wanted = switch (challenge) {
        LivenessChallenge.blink => SelfieHint.blink,
        LivenessChallenge.turnLeft => SelfieHint.turnLeft,
        LivenessChallenge.turnRight => SelfieHint.turnRight,
      };
    } else if (!cardOk) {
      wanted = SelfieHint.showId;
    } else if (!_steady) {
      wanted = SelfieHint.holdSteady;
    } else {
      wanted = SelfieHint.holdStill;
    }
    final ready = canCapture && cardOk && _steady;
    if (ready) {
      _holdSince ??= _now;
    } else {
      _holdSince = null;
    }
    // The first real hint replaces «starting» at once; the countdown hint
    // shows at once when everything is ready (its own ring is the delay).
    final hint = _hint.update(
      wanted,
      _now,
      immediate: _hint.value == SelfieHint.starting || ready,
    );
    final held = _holdSince == null ? Duration.zero : _now - _holdSince!;
    final progress = ready
        ? (held.inMicroseconds / c.holdBeforeCapture.inMicroseconds)
            .clamp(0.0, 1.0)
        : 0.0;
    return SelfieLivenessView(
      hint: hint,
      tone: ready
          ? OvalTone.ready
          : (present && !_multi ? OvalTone.active : OvalTone.neutral),
      challenge: challenge,
      challengeDone: _challengeDone,
      faceInOval: inPlace,
      cardDetected: _cardInPlace,
      canCapture: canCapture,
      showFallback: _now >= c.fallbackAfter,
      holdProgress: progress,
      guide: present ? _guide : null,
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
