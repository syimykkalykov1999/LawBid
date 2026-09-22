import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../tokens/app_motion.dart';
import 'app_button.dart';

/// Wraps [AppButton] with the judge's-gavel tap animation (file 07 §7).
/// Used ONLY on the buttons listed in file 07 §7.4; everywhere else use a
/// plain [AppButton] (`strike: false` behaves identically to AppButton, kept
/// as one widget rather than two so call sites don't need to swap types if a
/// button later needs `strike` toggled).
///
/// Composition: wraps [AppButton], never reimplements its chrome or the 0.98
/// press-scale — [GavelStrikeButton] only adds the Overlay-based strike
/// effect on top and fires [onPressed] itself after the spec'd delay.
class GavelStrikeButton extends StatefulWidget {
  const GavelStrikeButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.strike = true,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.isEnabled = true,
    this.height = 50,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool strike;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool isLoading;
  final bool isEnabled;
  final double height;

  @override
  State<GavelStrikeButton> createState() => _GavelStrikeButtonState();
}

class _GavelStrikeButtonState extends State<GavelStrikeButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  OverlayEntry? _entry;
  Timer? _actionTimer;
  bool _isAnimating = false;
  bool _hapticFired = false;
  Offset _tapPosition = Offset.zero;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: AppMotion.gavelStrike)
      ..addListener(_onTick)
      ..addStatusListener(_onStatus);
  }

  void _onTick() {
    if (!_hapticFired && _controller.value >= AppMotion.gavelHitProgress) {
      _hapticFired = true;
      HapticFeedback.mediumImpact();
    }
  }

  void _onStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed) {
      _removeOverlay();
      if (mounted) setState(() => _isAnimating = false);
    }
  }

  void _removeOverlay() {
    // Guard with `.mounted`: if the whole subtree (including the ancestor
    // Overlay) was torn down first — e.g. the button's route was popped
    // mid-animation — the entry may already be gone, and calling `.remove()`
    // on an entry whose Overlay no longer exists throws.
    final entry = _entry;
    _entry = null;
    if (entry != null && entry.mounted) entry.remove();
  }

  void _handleTapDown(TapDownDetails details) {
    _tapPosition = details.globalPosition;
  }

  void _handleTap() {
    if (_isAnimating) return; // repeated taps during animation are ignored (file 07 §7.3)
    if (widget.onPressed == null || !widget.isEnabled || widget.isLoading) return;

    final reduceMotion = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    if (!widget.strike || reduceMotion) {
      widget.onPressed!.call();
      return;
    }

    final screenWidth = MediaQuery.of(context).size.width;
    final mirror = _tapPosition.dx > screenWidth * 0.55;

    _hapticFired = false;
    _isAnimating = true;
    _entry = OverlayEntry(
      builder: (_) => _GavelStrikeOverlay(
        position: _tapPosition,
        controller: _controller,
        mirror: mirror,
        colors: Theme.of(context).extension<AppColorTokens>()!,
      ),
    );
    Overlay.of(context).insert(_entry!);
    _controller.forward(from: 0);

    _actionTimer?.cancel();
    _actionTimer = Timer(AppMotion.gavelActionDelay, () {
      if (mounted) widget.onPressed?.call();
    });
  }

  @override
  void dispose() {
    _actionTimer?.cancel();
    _removeOverlay();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppButton(
      label: widget.label,
      variant: widget.variant,
      icon: widget.icon,
      isLoading: widget.isLoading,
      isEnabled: widget.isEnabled,
      height: widget.height,
      onTapDown: _handleTapDown,
      onPressed: _handleTap,
    );
  }
}

/// Overlay layer: pedestal + gavel + strike ring, anchored to the tap point.
/// `RepaintBoundary`-isolated so its 620ms of repaints never cascade into the
/// rest of the screen (file 07 §7.5 performance requirement).
class _GavelStrikeOverlay extends StatelessWidget {
  const _GavelStrikeOverlay({
    required this.position,
    required this.controller,
    required this.mirror,
    required this.colors,
  });

  final Offset position;
  final AnimationController controller;
  final bool mirror;
  final AppColorTokens colors;

  @override
  Widget build(BuildContext context) {
    // Generous fixed hit-testable-free area around the tap point; the
    // painter draws relative to its own center, which we align to `position`.
    const size = 140.0;
    return Positioned(
      left: position.dx - size / 2,
      top: position.dy - size / 2,
      width: size,
      height: size,
      child: IgnorePointer(
        child: RepaintBoundary(
          child: AnimatedBuilder(
            animation: controller,
            builder: (context, _) {
              return CustomPaint(
                size: const Size(size, size),
                painter: _GavelStrikePainter(
                  progress: AppMotion.gavelStrikeCurve.transform(controller.value),
                  rawProgress: controller.value,
                  mirror: mirror,
                  colors: colors,
                  brightness: Theme.of(context).brightness,
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

double _keyframe(List<(double, double)> points, double t) {
  for (var i = 0; i < points.length - 1; i++) {
    final (t0, v0) = points[i];
    final (t1, v1) = points[i + 1];
    if (t >= t0 && t <= t1) {
      if (t1 == t0) return v1;
      final localT = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * localT;
    }
  }
  return points.last.$2;
}

class _GavelStrikePainter extends CustomPainter {
  _GavelStrikePainter({
    required this.progress,
    required this.rawProgress,
    required this.mirror,
    required this.colors,
    required this.brightness,
  });

  /// Eased progress (file 07 §7.3 curve applied) — drives rotation/opacity.
  final double progress;

  /// Linear 0..1 controller progress — drives the ring's own sub-timeline,
  /// which per file 07 §7.2 is timed against wall-clock ms, not the eased
  /// curve.
  final double rawProgress;
  final bool mirror;
  final AppColorTokens colors;
  final Brightness brightness;

  static const _rotationKeyframes = <(double, double)>[
    (0.0, 62),
    (0.52, 0),
    (0.62, 14),
    (0.78, 0),
    (1.0, 0),
  ];

  static const _opacityKeyframes = <(double, double)>[
    (0.0, 0),
    (0.14, 1),
    (0.78, 1),
    (1.0, 0),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final rotationDeg = _keyframe(_rotationKeyframes, progress);
    final opacity = _keyframe(_opacityKeyframes, progress).clamp(0.0, 1.0);

    final isLight = brightness == Brightness.light;
    final handleColor = isLight ? colors.goldDark : colors.goldLight;
    final headColor = isLight ? colors.navy : colors.gold;
    final stripeColor = isLight ? colors.gold : colors.goldDark;

    canvas.save();
    canvas.translate(center.dx, center.dy);

    // --- Pedestal (under the strike point), file 07 §7.2 item 1 ---
    final pedestalT = (rawProgress / 0.10).clamp(0.0, 1.0);
    final pedestalFadeOut = (1 - ((rawProgress - 0.85) / 0.15)).clamp(0.0, 1.0);
    final pedestalOpacity = math.min(pedestalT, pedestalFadeOut);
    final pedestalDy = progress >= AppMotion.gavelHitProgress ? 2.0 : 0.0;
    if (pedestalOpacity > 0) {
      final pedestalPaint = Paint()..color = colors.gold.withValues(alpha: pedestalOpacity);
      final pedestalRect = Rect.fromCenter(
        center: Offset(0, pedestalDy),
        width: 32,
        height: 7,
      );
      canvas.drawRRect(
        RRect.fromRectAndRadius(pedestalRect, const Radius.circular(3)),
        pedestalPaint,
      );
      final borderPaint = Paint()
        ..color = colors.goldDark.withValues(alpha: pedestalOpacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2;
      canvas.drawLine(
        Offset(pedestalRect.left, pedestalRect.bottom),
        Offset(pedestalRect.right, pedestalRect.bottom),
        borderPaint,
      );
    }

    // --- Gavel, drawn in its native 90x60 design space, rotated around the
    // handle's end (80,26) per file 07 §5 geometry, then translated so the
    // strike point (17,44) lands on the tap position. ---
    if (opacity > 0) {
      canvas.save();
      canvas.scale(mirror ? -1.0 : 1.0, 1.0);

      const designSize = 90.0; // wide edge of the 90x60 authoring space
      const renderWidth = 61.0;
      const renderHeight = 41.0;
      final scaleX = renderWidth / designSize * 1.0;
      final scaleY = renderHeight / 60.0;

      // Anchor: strike point (17,44) in design space maps to the touch point.
      const strikePoint = Offset(17, 44);
      const pivot = Offset(80, 26);

      canvas.translate(-strikePoint.dx * scaleX, -strikePoint.dy * scaleY);
      canvas.translate(pivot.dx * scaleX, pivot.dy * scaleY);
      canvas.rotate(-rotationDeg * math.pi / 180);
      canvas.translate(-pivot.dx * scaleX, -pivot.dy * scaleY);
      canvas.scale(scaleX, scaleY);

      final gavelOpacity = opacity;
      final handlePaint = Paint()..color = handleColor.withValues(alpha: gavelOpacity);
      final headPaint = Paint()..color = headColor.withValues(alpha: gavelOpacity);
      final stripePaint = Paint()..color = stripeColor.withValues(alpha: gavelOpacity);

      // Handle: rect(22,22,64,8) radius 4.
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(22, 22, 64, 8),
          const Radius.circular(4),
        ),
        handlePaint,
      );
      // Head: rect(6,4,22,40) radius 6.
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          const Rect.fromLTWH(6, 4, 22, 40),
          const Radius.circular(6),
        ),
        headPaint,
      );
      // Stripes.
      canvas.drawRect(const Rect.fromLTWH(6, 12, 22, 4), stripePaint);
      canvas.drawRect(const Rect.fromLTWH(6, 32, 22, 4), stripePaint);

      canvas.restore();
    }

    // --- Strike ring: starts at 300ms, 500ms duration, scale 0.4->6.5,
    // opacity 0.9->0 (file 07 §7.2 item 3). Timed on wall-clock ms, i.e.
    // against the linear controller value, not the eased `progress`. ---
    const ringStartFraction = 300 / 620;
    const ringDurationFraction = 500 / 620;
    final ringT = ((rawProgress - ringStartFraction) / ringDurationFraction).clamp(0.0, 1.0);
    if (rawProgress >= ringStartFraction) {
      final ringScale = 0.4 + (6.5 - 0.4) * ringT;
      final ringOpacity = (0.9 - 0.9 * ringT).clamp(0.0, 1.0);
      final ringPaint = Paint()
        ..color = colors.goldLight.withValues(alpha: ringOpacity)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2;
      canvas.drawCircle(const Offset(0, 0), 5 * ringScale, ringPaint);
    }

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _GavelStrikePainter oldDelegate) {
    return oldDelegate.rawProgress != rawProgress || oldDelegate.mirror != mirror;
  }
}
