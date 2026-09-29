import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// The Search tab's field (docs/05 §7.1). While empty and idle its hint
/// flips through what can be searched ("Attorneys by name", "@username",
/// "#topics" …) like a split-flap board; on focus the border warms to
/// gold, the hint settles, and "Cancel" slides in. Reduced motion: a
/// static hint, no flips.
class FlipSearchBar extends StatefulWidget {
  const FlipSearchBar({
    required this.controller,
    required this.focusNode,
    required this.hints,
    required this.cancelLabel,
    required this.clearLabel,
    required this.semanticLabel,
    this.onSubmitted,
    this.leading,
    this.trailing,
    this.showCancel = true,
    super.key,
  });

  final TextEditingController controller;
  final FocusNode focusNode;

  /// Rotating hint phrases; the first is the static one.
  final List<String> hints;
  final String cancelLabel;
  final String clearLabel;
  final String semanticLabel;
  final ValueChanged<String>? onSubmitted;

  /// Owner 2026-09-29: replaces the default magnifier at the left edge
  /// (the Search tab puts its Filters button here).
  final Widget? leading;

  /// Owner 2026-09-29: a control at the right edge, after the clear
  /// button (the Search tab puts its magnifier here).
  final Widget? trailing;

  /// Whether the "Cancel" text button slides in next to the field while
  /// focused. `false` when the caller has its own way to close.
  final bool showCancel;

  @override
  State<FlipSearchBar> createState() => _FlipSearchBarState();
}

class _FlipSearchBarState extends State<FlipSearchBar> {
  static const _period = Duration(milliseconds: 2800);
  Timer? _timer;
  int _hint = 0;

  bool get _focused => widget.focusNode.hasFocus;
  bool get _empty => widget.controller.text.isEmpty;

  @override
  void initState() {
    super.initState();
    widget.focusNode.addListener(_changed);
    widget.controller.addListener(_changed);
    WidgetsBinding.instance.addPostFrameCallback((_) => _schedule());
  }

  @override
  void didUpdateWidget(FlipSearchBar old) {
    super.didUpdateWidget(old);
    if (old.hints.length != widget.hints.length) _hint = 0;
  }

  @override
  void dispose() {
    _timer?.cancel();
    widget.focusNode.removeListener(_changed);
    widget.controller.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (!mounted) return;
    setState(() {});
    _schedule();
  }

  /// Flip only while idle, empty, visible and motion is allowed.
  void _schedule() {
    final run = mounted &&
        !_focused &&
        _empty &&
        widget.hints.length > 1 &&
        !context.reduceMotion &&
        TickerMode.valuesOf(context).enabled;
    if (!run) {
      _timer?.cancel();
      _timer = null;
      return;
    }
    _timer ??= Timer.periodic(_period, (_) {
      if (!mounted) return;
      setState(() => _hint = (_hint + 1) % widget.hints.length);
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final reduce = context.reduceMotion;
    final d = reduce ? Duration.zero : AppMotion.stateChange;
    final focused = _focused;
    final hint = widget.hints.isEmpty
        ? ''
        : widget.hints[(focused || reduce) ? 0 : _hint % widget.hints.length];

    final field = AnimatedContainer(
      duration: d,
      curve: AppMotion.enterCurve,
      // 48 px inside the (up to 1.5 px) border.
      height: 51,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(
          color: focused ? colors.gold : colors.border,
          width: focused ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: focused
                ? colors.gold.withValues(alpha: 0.22)
                : colors.shadow.withValues(alpha: 0),
            blurRadius: focused ? 18 : 0,
            spreadRadius: focused ? 1 : 0,
          ),
        ],
      ),
      child: Row(
        children: [
          if (widget.leading != null) ...[
            const SizedBox(width: AppSpacing.xs),
            widget.leading!,
          ] else ...[
            const SizedBox(width: AppSpacing.md),
            AnimatedRotation(
              turns: focused ? -0.06 : 0,
              duration: d,
              child: Icon(
                Icons.search_rounded,
                color: focused ? colors.goldDark : colors.textSecondary,
              ),
            ),
          ],
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Stack(
              alignment: Alignment.centerLeft,
              children: [
                if (_empty)
                  IgnorePointer(
                    child: ClipRect(
                      child: AnimatedSwitcher(
                        duration: reduce
                            ? Duration.zero
                            : const Duration(milliseconds: 520),
                        switchInCurve: Curves.easeOutCubic,
                        switchOutCurve: Curves.easeInCubic,
                        layoutBuilder: (current, previous) => Stack(
                          alignment: Alignment.centerLeft,
                          children: [...previous, if (current != null) current],
                        ),
                        transitionBuilder: _flip,
                        child: Text(
                          hint,
                          key: ValueKey(hint),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body
                              .copyWith(color: colors.textSecondary),
                        ),
                      ),
                    ),
                  ),
                Semantics(
                  textField: true,
                  label: widget.semanticLabel,
                  child: TextField(
                    controller: widget.controller,
                    focusNode: widget.focusNode,
                    textInputAction: TextInputAction.search,
                    onSubmitted: widget.onSubmitted,
                    style: type.body.copyWith(color: colors.text),
                    cursorColor: colors.goldDark,
                    // Full 48 px tall: the whole bar is the tap target
                    // (docs/01 §8.4).
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
              ],
            ),
          ),
          AnimatedScale(
            scale: _empty ? 0 : 1,
            duration: d,
            curve: Curves.easeOutBack,
            child: AppIconButton(
              icon: Icon(Icons.cancel_rounded,
                  color: colors.textSecondary, size: 20,),
              semanticLabel: widget.clearLabel,
              onPressed: _empty
                  ? null
                  : () {
                      HapticFeedback.selectionClick();
                      widget.controller.clear();
                    },
            ),
          ),
          if (widget.trailing != null) ...[
            widget.trailing!,
            const SizedBox(width: AppSpacing.xs),
          ],
        ],
      ),
    );

    if (!widget.showCancel) return field;

    return Row(
      children: [
        Expanded(child: field),
        AnimatedSize(
          duration: d,
          curve: AppMotion.enterCurve,
          child: focused
              ? TextButton(
                  onPressed: () {
                    widget.controller.clear();
                    widget.focusNode.unfocus();
                  },
                  style: TextButton.styleFrom(
                    foregroundColor: colors.text,
                    minimumSize: const Size(0, AppSizes.touchTarget),
                    padding:
                        const EdgeInsets.only(left: AppSpacing.md),
                  ),
                  child: Text(widget.cancelLabel),
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }

  /// Split-flap: the outgoing phrase tips back over the top edge while
  /// the incoming one falls into place from below.
  Widget _flip(Widget child, Animation<double> animation) {
    final incoming = child.key == ValueKey(widget.hints.isEmpty
        ? ''
        : widget.hints[_hint % widget.hints.length],);
    return AnimatedBuilder(
      animation: animation,
      child: child,
      builder: (context, child) {
        final t = animation.value;
        final angle = (1 - t) * (math.pi / 2) * (incoming ? 1 : -1);
        return Opacity(
          opacity: t.clamp(0, 1),
          child: Transform(
            alignment: incoming ? Alignment.topCenter : Alignment.bottomCenter,
            transform: Matrix4.identity()
              ..setEntry(3, 2, 0.0022)
              ..rotateX(angle),
            child: child,
          ),
        );
      },
    );
  }
}
