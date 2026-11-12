import 'dart:math' as math;
import 'dart:ui' show Offset, Rect, Size;

import 'package:flutter/foundation.dart' show immutable;

/// Owner 2026-11-12 (row 62, docs/dev/SELFIE_ID_CAPTURE_RESEARCH_2026-11-12.md):
/// where the face oval and the ID-card frame of the «selfie with your ID»
/// camera are drawn. Before, both sat at fixed spots, so the attorney had
/// to move the phone until the face matched them (too far or too close).
/// Now the guide is placed AROUND the face the detector sees: the oval is
/// sized from the face box, the card frame (ID-1 proportions) sits beside
/// it at chin height, on the side with room. Pure geometry in normalized
/// screen coordinates (0..1 of width / height), unit-tested.

/// ISO/IEC 7810 ID-1 (driver license, state ID, bar card): 85.6 × 54 mm.
const double idCardRatio = 85.6 / 54;

/// One guide: oval + card frame, normalized to the screen.
@immutable
class SelfieGuide {
  const SelfieGuide({
    required this.oval,
    required this.card,
    required this.cardOnRight,
  });

  final Rect oval;
  final Rect card;
  final bool cardOnRight;

  Rect ovalOn(Size s) => _scale(oval, s);
  Rect cardOn(Size s) => _scale(card, s);

  static Rect _scale(Rect r, Size s) => Rect.fromLTRB(
        r.left * s.width,
        r.top * s.height,
        r.right * s.width,
        r.bottom * s.height,
      );

  /// Every edge of both frames within [eps] of [other]'s: not worth a
  /// redraw (the dead band that keeps the guide from trembling).
  bool near(SelfieGuide other, double eps) =>
      cardOnRight == other.cardOnRight &&
      _near(oval, other.oval, eps) &&
      _near(card, other.card, eps);

  static bool _near(Rect a, Rect b, double eps) =>
      (a.left - b.left).abs() <= eps &&
      (a.top - b.top).abs() <= eps &&
      (a.right - b.right).abs() <= eps &&
      (a.bottom - b.bottom).abs() <= eps;

  @override
  bool operator ==(Object other) =>
      other is SelfieGuide &&
      other.oval == oval &&
      other.card == card &&
      other.cardOnRight == cardOnRight;

  @override
  int get hashCode => Object.hash(oval, card, cardOnRight);
}

/// A guide placed around a face, and whether the card frame fits beside it.
typedef PlacedGuide = ({SelfieGuide guide, bool cardFits, double room});

/// Builds guides for one screen shape.
@immutable
class SelfieGuideGeometry {
  const SelfieGuideGeometry({
    this.aspect = 844 / 390,
    this.ovalToFace = 1.4,
    this.ovalAspect = 1.3,
    this.minOvalWidth = 0.34,
    this.maxOvalWidth = 0.72,
    this.cardToFace = 0.9,
    this.minCardWidth = 0.2,
    this.gap = 0.03,
    this.margin = 0.02,
    this.switchSideMargin = 0.08,
  });

  /// Screen height / width (normalized boxes need it to keep shapes).
  final double aspect;

  /// Oval width / face box width (ML Kit's box stops at the brows and the
  /// chin; the oval also takes the forehead and some air).
  final double ovalToFace;

  /// Oval height / width, in pixels.
  final double ovalAspect;
  final double minOvalWidth;
  final double maxOvalWidth;

  /// Card frame width / face box width. A real ID-1 card is ~0.6 of a
  /// face's width at the same distance; held a little nearer the camera
  /// it looks bigger, so the frame is generous.
  final double cardToFace;
  final double minCardWidth;
  final double gap;
  final double margin;

  /// The card frame changes side only when the other side has this much
  /// more room (no ping-pong when the face is near the middle).
  final double switchSideMargin;

  /// The guide before any face is seen (the previous fixed layout: oval
  /// left of centre, card beside it — the look stays the same).
  SelfieGuide rest() {
    const w = 0.5;
    final h = math.min(w * ovalAspect / aspect, 0.42);
    final oval = Rect.fromCenter(
      center: const Offset(0.36, 0.40),
      width: w,
      height: h,
    );
    final left = oval.right + gap;
    final cw = (1 - gap) - left;
    final ch = cw / idCardRatio / aspect;
    final cy = oval.center.dy + oval.height * 0.12;
    return SelfieGuide(
      oval: oval,
      card: Rect.fromLTWH(left, cy - ch / 2, cw, ch),
      cardOnRight: true,
    );
  }

  /// The guide around [face] (normalized box, already mirrored like the
  /// preview). [preferRight]: the side used so far (hysteresis).
  PlacedGuide around(Rect face, {bool? preferRight}) {
    final ow = (face.width * ovalToFace).clamp(minOvalWidth, maxOvalWidth);
    final oh = ow * ovalAspect / aspect;
    // The face box starts at the brows: lift the oval a little.
    final oval = Rect.fromCenter(
      center: Offset(face.center.dx, face.center.dy - face.height * 0.08),
      width: ow,
      height: oh,
    );
    final roomRight = 1 - margin - gap - oval.right;
    final roomLeft = oval.left - gap - margin;
    bool right;
    if (preferRight == null) {
      right = roomRight >= roomLeft;
    } else if (preferRight) {
      right = !(roomLeft > roomRight + switchSideMargin);
    } else {
      right = roomRight > roomLeft + switchSideMargin;
    }
    final room = right ? roomRight : roomLeft;
    final faceW = ow / ovalToFace;
    final target = math.max(faceW * cardToFace, minCardWidth);
    final cw = math.max(math.min(target, room), minCardWidth);
    final fits = room >= math.max(minCardWidth, target * 0.6);
    final ch = cw / idCardRatio / aspect;
    final cy = (oval.center.dy + oval.height * 0.12)
        .clamp(margin + ch / 2, 1 - margin - ch / 2);
    var left = right ? oval.right + gap : oval.left - gap - cw;
    left = left.clamp(margin, math.max(margin, 1 - margin - cw));
    return (
      guide: SelfieGuide(
        oval: oval,
        card: Rect.fromLTWH(left, cy - ch / 2, cw, ch),
        cardOnRight: right,
      ),
      cardFits: fits,
      room: roomLeft + roomRight,
    );
  }
}

/// Shows a new value only after it has been asked for [dwell] in a row,
/// so a one-frame detector miss never reaches the screen.
class Debounced<T> {
  Debounced(this._shown, {required this.dwell});

  final Duration dwell;
  T _shown;
  T? _candidate;
  Duration? _since;

  T get value => _shown;

  T update(T wanted, Duration now, {bool immediate = false}) {
    if (wanted == _shown || immediate) {
      _shown = wanted;
      _candidate = null;
      _since = null;
      return _shown;
    }
    if (wanted != _candidate) {
      _candidate = wanted;
      _since = now;
    }
    if (now - _since! >= dwell) {
      _shown = wanted;
      _candidate = null;
      _since = null;
    }
    return _shown;
  }
}
