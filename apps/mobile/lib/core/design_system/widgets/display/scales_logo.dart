import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_fonts.dart';
import 'package:lawbid/core/navigation/route_observer.dart';

/// LawBid's scales-of-justice logo, drawn with [CustomPainter] (file 07 §5) —
/// never an image, so it stays crisp at any size and re-themes for free.
///
/// One widget serves BOTH usages named in the ТЗ (large animated welcome
/// screen, small static feed-header logo): when [animated] is false, no
/// [AnimationController]/`Ticker` is even created, so the "cheap static
/// widget" requirement is met without a second class — see the stage 1.5
/// architecture review in docs/CHANGELOG.md for the reasoning.
///
/// NOTE (docs/CHANGELOG.md stage 1.5): this geometry/animation was authored
/// from the numeric spec in file 07 §5 without being able to actually run
/// Flutter in this sandbox (no device available here — see stage 1.4/1.5
/// environment notes). Please eyeball it on your Mac once you can build; the
/// pan-swing direction/bowl-curve direction are the two details most likely
/// to need a one-line tweak if they read wrong.
class ScalesLogo extends StatefulWidget {
  const ScalesLogo({
    super.key,
    this.size = 96,
    this.animated = false,
    this.strokeColor,
    this.semanticLabel = 'LawBid',
    this.standExtension = 0,
    this.runFor,
  });

  /// Owner 2026-09-30: header logos swing for this long after appearing,
  /// easing to rest (level beam) at the end; null = swing forever (the
  /// welcome screen). A finite run also lets the app settle.
  final Duration? runFor;

  /// Width of the widget; height follows the 300x212 design aspect ratio,
  /// plus [standExtension].
  final double size;
  final bool animated;
  final Color? strokeColor;
  final String? semanticLabel;

  /// Extra length (in the same 300x212 design-space units as everything
  /// else the painter draws, so it scales with [size] like the rest of the
  /// drawing) added ONLY to the stand/base at the bottom — the topper,
  /// beam, and pans keep their normal proportions. 2026-09-22 owner
  /// request: fill empty space below the logo on the welcome screen by
  /// stretching the stand, not by enlarging the whole logo. Default 0
  /// keeps every other call site (feed-header static logo, golden tests)
  /// pixel-identical.
  final double standExtension;

  @override
  State<ScalesLogo> createState() => _ScalesLogoState();
}

class _ScalesLogoState extends State<ScalesLogo>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver, RouteAware {
  AnimationController? _controller;
  bool _routeCurrent = true;
  bool _subscribedToRoute = false;

  @override
  void initState() {
    super.initState();
    if (widget.animated) {
      WidgetsBinding.instance.addObserver(this);
      // Created but NOT started here: MediaQuery (needed to check reduce
      // motion) isn't reliably available until didChangeDependencies. The
      // controller must not tick at all under reduce motion (file 07 §5.2:
      // "не запускается при включённом системном «уменьшить движение»"),
      // not merely render frozen, so starting it is deferred to
      // `_syncTicking()`.
      _controller = AnimationController(
        vsync: this,
        duration: widget.runFor ?? const Duration(days: 1),
      );
    }
  }

  bool get _reduceMotion =>
      MediaQuery.maybeOf(context)?.disableAnimations ?? false;

  bool get _shouldRun => widget.animated && !_reduceMotion && _routeCurrent;

  void _syncTicking() {
    final controller = _controller;
    if (controller == null) return;
    if (_shouldRun) {
      if (widget.runFor != null) {
        if (!controller.isAnimating && !controller.isCompleted) {
          controller.forward();
        }
      } else if (!controller.isAnimating) {
        controller.repeat();
      }
    } else {
      if (controller.isAnimating) controller.stop();
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (widget.animated) {
      if (!_subscribedToRoute) {
        final route = ModalRoute.of(context);
        if (route is PageRoute<void>) {
          routeObserver.subscribe(this, route);
          _subscribedToRoute = true;
        }
      }
      // Re-evaluated on every dependency change, which includes the system
      // "reduce motion" setting flipping while the app is running.
      _syncTicking();
    }
  }

  @override
  void didPushNext() {
    // Another screen was pushed on top of this one — pause (file 07 §5.2).
    _routeCurrent = false;
    _syncTicking();
  }

  @override
  void didPopNext() {
    // Back to being the visible screen — resume if still eligible.
    _routeCurrent = true;
    _syncTicking();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) {
      _controller?.stop();
    } else {
      _syncTicking();
    }
  }

  @override
  void dispose() {
    if (widget.animated) {
      WidgetsBinding.instance.removeObserver(this);
      if (_subscribedToRoute) routeObserver.unsubscribe(this);
    }
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final height = widget.size * (212 + widget.standExtension) / 300;

    Widget paint(double tSeconds) {
      // A finite run fades the swing out over its last 1.5 s.
      final run = widget.runFor;
      final amplitude = run == null
          ? 1.0
          : ((run.inMicroseconds / Duration.microsecondsPerSecond - tSeconds) /
                  1.5)
              .clamp(0.0, 1.0);
      return CustomPaint(
        size: Size(widget.size, height),
        painter: _ScalesPainter(
          tSeconds: _shouldRun ? tSeconds : 0,
          amplitude: _shouldRun ? amplitude : 1,
          scale: widget.size / 300,
          colors: colors,
          strokeColorOverride: widget.strokeColor,
          standExtension: widget.standExtension,
        ),
      );
    }

    final painted = _controller == null
        ? paint(0)
        : AnimatedBuilder(
            animation: _controller!,
            builder: (context, _) {
              final seconds =
                  _controller!.lastElapsedDuration?.inMicroseconds ?? 0;
              return paint(seconds / Duration.microsecondsPerSecond);
            },
          );

    return Semantics(
      label: widget.semanticLabel,
      image: true,
      child: ExcludeSemantics(child: painted),
    );
  }
}

class _ScalesPainter extends CustomPainter {
  _ScalesPainter({
    required this.tSeconds,
    required this.scale,
    required this.colors,
    this.amplitude = 1,
    this.strokeColorOverride,
    this.standExtension = 0,
  });

  final double tSeconds;

  /// 0..1 multiplier of the swing (a finite run eases to rest).
  final double amplitude;
  final double scale;
  final AppColorTokens colors;
  final Color? strokeColorOverride;
  final double standExtension;

  /// angle(t) = 5.5*sin(1.35t) + 1.6*sin(2.9t + 1), degrees (file 07 §5.2).
  double get _angleDeg =>
      amplitude *
      (5.5 * math.sin(1.35 * tSeconds) + 1.6 * math.sin(2.9 * tSeconds + 1));

  static const _pivot = Offset(150, 44);
  static const _leftOrigin = Offset(50, 44);
  static const _rightOrigin = Offset(250, 44);

  Offset _rotateAround(Offset p, Offset pivot, double angleRad) {
    final dx = p.dx - pivot.dx;
    final dy = p.dy - pivot.dy;
    final cosA = math.cos(angleRad);
    final sinA = math.sin(angleRad);
    return Offset(
      pivot.dx + dx * cosA - dy * sinA,
      pivot.dy + dx * sinA + dy * cosA,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    // ignore: cascade_invocations
    canvas.scale(scale, scale);

    final lineColor = strokeColorOverride ?? colors.goldStroke;
    final linePaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.6
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // Топпер: круг (150,16) r5, только контур.
    canvas.drawCircle(const Offset(150, 16), 5, linePaint);
    // Стойка — удлинена на standExtension (owner request, 2026-09-22),
    // топпер/коромысло/чаши выше не трогаем.
    final standBottomY = 192 + standExtension;
    canvas.drawLine(
      const Offset(150, 21),
      Offset(150, standBottomY),
      linePaint,
    );
    // Основание — сдвинуто вниз вместе со стойкой, тот же зазор 11 между
    // линиями, что и раньше (203-192).
    // ignore: cascade_invocations
    canvas.drawLine(
      Offset(112, standBottomY),
      Offset(188, standBottomY),
      linePaint,
    );
    canvas.drawLine(
      Offset(122, standBottomY + 11),
      Offset(178, standBottomY + 11),
      linePaint,
    );

    final angleRad = _angleDeg * math.pi / 180;
    final leftEnd =
        Offset(150 - 100 * math.cos(angleRad), 44 - 100 * math.sin(angleRad));
    final rightEnd =
        Offset(150 + 100 * math.cos(angleRad), 44 + 100 * math.sin(angleRad));

    // Коромысло.
    canvas.drawLine(leftEnd, rightEnd, linePaint);

    // Каждая чаша поворачивается в противоположную сторону на angle*0.55
    // вокруг (нового) подвеса, после переноса к новому концу коромысла
    // (file 07 §5.2).
    final panRotation = -angleRad * 0.55;

    _drawPan(
      canvas: canvas,
      origin: _leftOrigin,
      newEnd: leftEnd,
      panRotation: panRotation,
      bowlTopLeft: const Offset(12, 118),
      bowlTopRight: const Offset(88, 118),
      textCenterX: 50,
      text: 'Law',
      linePaint: linePaint,
    );
    _drawPan(
      canvas: canvas,
      origin: _rightOrigin,
      newEnd: rightEnd,
      panRotation: panRotation,
      bowlTopLeft: const Offset(212, 118),
      bowlTopRight: const Offset(288, 118),
      textCenterX: 250,
      text: 'Bid',
      linePaint: linePaint,
    );

    // Ось коромысла: залитый круг радиус 6, поверх линий.
    canvas.drawCircle(_pivot, 6, Paint()..color = lineColor);

    // ignore: cascade_invocations
    canvas.restore();
  }

  void _drawPan({
    required Canvas canvas,
    required Offset origin,
    required Offset newEnd,
    required double panRotation,
    required Offset bowlTopLeft,
    required Offset bowlTopRight,
    required double textCenterX,
    required String text,
    required Paint linePaint,
  }) {
    final translation = newEnd - origin;

    Offset xf(Offset p) => _rotateAround(p + translation, newEnd, panRotation);

    // Нити.
    final threadLeftTop = xf(origin);
    final threadLeftBottom = xf(bowlTopLeft);
    final threadRightTop = xf(origin);
    final threadRightBottom = xf(bowlTopRight);
    canvas.drawLine(threadLeftTop, threadLeftBottom, linePaint);
    // ignore: cascade_invocations
    canvas.drawLine(threadRightTop, threadRightBottom, linePaint);

    // Чаша: полуэллипс — верхняя кромка прямая, низ дугой радиус 38x34.
    final topLeft = xf(bowlTopLeft);
    final topRight = xf(bowlTopRight);
    final fillPaint = Paint()..color = colors.panFill;
    final bowlPath = Path()
      ..moveTo(topLeft.dx, topLeft.dy)
      ..lineTo(topRight.dx, topRight.dy)
      ..arcToPoint(
        topLeft,
        radius: const Radius.elliptical(38, 34),
      )
      ..close();
    canvas.drawPath(bowlPath, fillPaint);
    // ignore: cascade_invocations
    canvas.drawPath(bowlPath, linePaint..strokeWidth = 1.6);
    linePaint.strokeWidth = 2.6; // restore for subsequent lines

    // Слово на чаше — вращаем вместе с чашей, тем же панорот.
    final textCenter = xf(Offset(textCenterX, 135));
    final textPainter = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          fontFamily: AppFontFamilies.serif,
          fontWeight: FontWeight.w600,
          fontSize: 19,
          color: colors.panText,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    canvas.save();
    // ignore: cascade_invocations
    canvas.translate(textCenter.dx, textCenter.dy);
    canvas.rotate(panRotation);
    textPainter.paint(
      canvas,
      Offset(-textPainter.width / 2, -textPainter.height / 2),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ScalesPainter oldDelegate) {
    return oldDelegate.tSeconds != tSeconds ||
        oldDelegate.amplitude != amplitude ||
        oldDelegate.colors != colors ||
        oldDelegate.standExtension != standExtension;
  }
}
