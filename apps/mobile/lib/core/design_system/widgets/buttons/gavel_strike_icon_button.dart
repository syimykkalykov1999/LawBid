part of 'gavel_strike_button.dart';

/// Wraps [AppIconButton] with the same judge's-gavel tap animation as
/// [GavelStrikeButton] (file 07 §7.4: welcome screen's email/Apple/Google
/// buttons). See gavel_strike_button.dart's top-of-file comment for why
/// this is a `part of` split rather than a second copy of the overlay/
/// painter code — the animation-state-machine below is otherwise a
/// line-for-line mirror of `_GavelStrikeButtonState`, just targeting
/// [AppIconButton] instead of [AppButton]. If the two ever drift, that's a
/// sign that state machine belongs in one shared class instead of two
/// mirrored ones — not attempted here to avoid a larger, riskier refactor
/// of the already-committed stage-1.5 [GavelStrikeButton] in the same pass
/// as new screens (docs/CHANGELOG.md stage 1.7 judgment call).
class GavelStrikeIconButton extends StatefulWidget {
  const GavelStrikeIconButton({
    super.key,
    required this.icon,
    required this.onPressed,
    required this.semanticLabel,
    this.strike = false,
  });

  final Widget icon;
  final VoidCallback? onPressed;
  final String semanticLabel;
  final bool strike;

  @override
  State<GavelStrikeIconButton> createState() => _GavelStrikeIconButtonState();
}

class _GavelStrikeIconButtonState extends State<GavelStrikeIconButton>
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
    final entry = _entry;
    _entry = null;
    if (entry != null && entry.mounted) entry.remove();
  }

  void _handleTapDown(TapDownDetails details) {
    _tapPosition = details.globalPosition;
  }

  void _handleTap() {
    if (_isAnimating) return;
    if (widget.onPressed == null) return;

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
    return AppIconButton(
      icon: widget.icon,
      semanticLabel: widget.semanticLabel,
      onTapDown: _handleTapDown,
      onPressed: _handleTap,
    );
  }
}
