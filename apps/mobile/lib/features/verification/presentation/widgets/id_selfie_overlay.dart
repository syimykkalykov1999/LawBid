import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';

/// Owner 2026-10-28 (ID selfie camera): the guide over the front-camera
/// preview — a face oval and an ID-card frame beside it, the rest dimmed.
/// The oval's colour follows [tone] (neutral → gold → green), the card
/// frame turns green once a card is seen, and a ring fills around the oval
/// during the short hold before the auto-capture. Colour and ring changes
/// are implicit animations (no per-frame setState); the painter repaints
/// only when its values change; it sits in its own RepaintBoundary so the
/// camera texture under it never repaints with it.
class IdSelfieOverlay extends StatelessWidget {
  const IdSelfieOverlay({
    required this.tone,
    required this.cardDetected,
    required this.holdProgress,
    super.key,
  });

  final OvalTone tone;
  final bool cardDetected;
  final double holdProgress;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final oval = switch (tone) {
      OvalTone.neutral => colors.goldLight.withValues(alpha: 0.7),
      OvalTone.active => colors.gold,
      OvalTone.ready => colors.success,
    };
    final card = cardDetected ? colors.success : colors.goldLight;
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return ExcludeSemantics(
      child: RepaintBoundary(
        child: TweenAnimationBuilder<Color?>(
          tween: ColorTween(end: oval),
          duration: duration,
          builder: (context, ovalColor, _) => TweenAnimationBuilder<Color?>(
            tween: ColorTween(end: card),
            duration: duration,
            builder: (context, cardColor, _) => TweenAnimationBuilder<double>(
              tween: Tween(end: holdProgress),
              duration: context.reduceMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 180),
              builder: (context, progress, _) => CustomPaint(
                key: const ValueKey('id-selfie-overlay'),
                size: Size.infinite,
                painter: IdSelfieGuidePainter(
                  scrim: colors.navy.withValues(alpha: 0.62),
                  oval: ovalColor ?? oval,
                  card: cardColor ?? card,
                  progress: progress,
                  ring: colors.success,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class IdSelfieGuidePainter extends CustomPainter {
  IdSelfieGuidePainter({
    required this.scrim,
    required this.oval,
    required this.card,
    required this.progress,
    required this.ring,
  });

  final Color scrim;
  final Color oval;
  final Color card;
  final double progress;
  final Color ring;

  @override
  void paint(Canvas canvas, Size size) {
    final layout = SelfieGuideLayout(size);
    final o = layout.oval;
    final c = layout.card;
    final cardShape = RRect.fromRectAndRadius(
      c,
      const Radius.circular(AppRadii.card),
    );
    canvas
      ..drawPath(
        Path()
          ..fillType = PathFillType.evenOdd
          ..addRect(Offset.zero & size)
          ..addOval(o)
          ..addRRect(cardShape),
        Paint()..color = scrim,
      )
      ..drawOval(
        o,
        Paint()
          ..color = oval
          ..style = PaintingStyle.stroke
          ..strokeWidth = 3,
      );
    if (progress > 0) {
      canvas.drawArc(
        o.inflate(AppSpacing.sm),
        -math.pi / 2,
        2 * math.pi * progress.clamp(0, 1),
        false,
        Paint()
          ..color = ring
          ..style = PaintingStyle.stroke
          ..strokeWidth = 4
          ..strokeCap = StrokeCap.round,
      );
    }
    canvas.drawRRect(
      cardShape,
      Paint()
        ..color = card.withValues(alpha: 0.45)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
    // Bold corner brackets on the card frame, like the ID photo screen.
    final corner = Paint()
      ..color = card
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.5
      ..strokeCap = StrokeCap.round;
    final len = math.min(AppSpacing.lg, c.shortestSide / 3);
    for (final (p, dx, dy) in [
      (c.topLeft, 1.0, 1.0),
      (c.topRight, -1.0, 1.0),
      (c.bottomLeft, 1.0, -1.0),
      (c.bottomRight, -1.0, -1.0),
    ]) {
      canvas
        ..drawLine(p, p.translate(len * dx, 0), corner)
        ..drawLine(p, p.translate(0, len * dy), corner);
    }
  }

  @override
  bool shouldRepaint(IdSelfieGuidePainter old) =>
      old.oval != oval ||
      old.card != card ||
      old.progress != progress ||
      old.scrim != scrim ||
      old.ring != ring;
}

/// The small looping example (≈2.4 s): a person raises an ID card next to
/// the face, a glint crosses the card, the card lowers. Vector, drawn
/// here — no asset or service. Static (card raised) under reduce-motion.
class IdSelfieExample extends StatefulWidget {
  const IdSelfieExample({required this.semanticLabel, super.key});

  final String semanticLabel;

  static const double size = AppSpacing.unit * 16; // 64

  @override
  State<IdSelfieExample> createState() => _IdSelfieExampleState();
}

class _IdSelfieExampleState extends State<IdSelfieExample>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _c
        ..stop()
        ..value = 0.5;
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      image: true,
      label: widget.semanticLabel,
      child: RepaintBoundary(
        child: SizedBox.square(
          dimension: IdSelfieExample.size,
          child: CustomPaint(
            painter: _ExamplePainter(
              t: _c,
              person: colors.goldLight,
              card: colors.gold,
              glint: colors.surface,
            ),
          ),
        ),
      ),
    );
  }
}

class _ExamplePainter extends CustomPainter {
  _ExamplePainter({
    required this.t,
    required this.person,
    required this.card,
    required this.glint,
  }) : super(repaint: t);

  final Animation<double> t;
  final Color person;
  final Color card;
  final Color glint;

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    final v = t.value;
    // 0–0.3 raise, 0.3–0.8 hold (glint at 0.4–0.65), 0.8–1 lower.
    final raise = v < 0.3
        ? Curves.easeOutCubic.transform(v / 0.3)
        : v < 0.8
            ? 1.0
            : 1 - Curves.easeInCubic.transform((v - 0.8) / 0.2);
    final stroke = Paint()
      ..color = person
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.045
      ..strokeCap = StrokeCap.round;
    // Head and shoulders, left of centre (the oval's place).
    final head = Offset(s * 0.38, s * 0.36);
    canvas
      ..drawCircle(head, s * 0.16, stroke)
      ..drawPath(
        Path()
          ..moveTo(s * 0.08, s * 0.98)
          ..quadraticBezierTo(s * 0.10, s * 0.62, s * 0.38, s * 0.60)
          ..quadraticBezierTo(s * 0.62, s * 0.62, s * 0.66, s * 0.82),
        stroke,
      );
    // The card: from the shoulder up to beside the face.
    final low = Offset(s * 0.74, s * 0.92);
    final high = Offset(s * 0.76, s * 0.42);
    final at = Offset.lerp(low, high, raise)!;
    final rect = Rect.fromCenter(center: at, width: s * 0.36, height: s * 0.23);
    final rr = RRect.fromRectAndRadius(rect, Radius.circular(s * 0.04));
    canvas
      ..drawRRect(rr, Paint()..color = card)
      // Hand: a short arm line to the card's lower edge.
      ..drawLine(
        Offset(s * 0.62, s * 0.98),
        Offset(at.dx - s * 0.04, rect.bottom),
        stroke,
      )
      // Photo square and two text lines on the card.
      ..drawRect(
        Rect.fromLTWH(
          rect.left + s * 0.03,
          rect.top + s * 0.04,
          s * 0.09,
          s * 0.12,
        ),
        Paint()..color = glint.withValues(alpha: 0.7),
      );
    final line = Paint()
      ..color = glint.withValues(alpha: 0.7)
      ..strokeWidth = s * 0.025
      ..strokeCap = StrokeCap.round;
    for (final y in [0.37, 0.52]) {
      canvas.drawLine(
        Offset(rect.left + s * 0.16, rect.top + rect.height * y + s * 0.03),
        Offset(rect.right - s * 0.04, rect.top + rect.height * y + s * 0.03),
        line,
      );
    }
    if (v > 0.4 && v < 0.65) {
      final g = (v - 0.4) / 0.25;
      final x = rect.left + rect.width * g;
      canvas
        ..save()
        ..clipRRect(rr)
        ..drawLine(
          Offset(x, rect.bottom),
          Offset(x + rect.width * 0.25, rect.top),
          Paint()
            ..color = glint.withValues(alpha: 0.55)
            ..strokeWidth = s * 0.05,
        )
        ..restore();
    }
  }

  @override
  bool shouldRepaint(_ExamplePainter old) =>
      old.person != person || old.card != card || old.glint != glint;
}
