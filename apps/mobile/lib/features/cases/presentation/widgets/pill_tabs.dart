import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Segmented tabs (owner decision 2026-09-29, replaces the scrolling
/// underline row): every tab takes the same width, labels are centered,
/// the row sits in a subtle rounded container with thin separators
/// between the sections, and the selected section is tinted gold with a
/// gold underline. Used by the feed (Posts/Cases), Search (People/Cases/
/// Posts/Topics), Mine and the topic screen.
///
/// Long labels at 200% text shrink to fit their section rather than
/// forcing a horizontal scroll.
class PillTabs<T> extends StatelessWidget {
  const PillTabs({
    required this.value,
    required this.tabs,
    required this.onChanged,
    super.key,
    this.onDark = false,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.screenSide,
      AppSpacing.sm,
      AppSpacing.screenSide,
      AppSpacing.sm,
    ),
  });

  final T value;
  final List<(T, String)> tabs;
  final ValueChanged<T> onChanged;

  /// Outer padding around the container.
  final EdgeInsets padding;

  /// Owner 2026-10-12: over the Reels video — same size and place, white
  /// text, no frame, fill or dividers.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final radius = BorderRadius.circular(AppRadii.field);

    return Padding(
      padding: padding,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: onDark ? Colors.transparent : colors.surface,
          borderRadius: radius,
          border: Border.all(
            color: onDark ? Colors.transparent : colors.border,
          ),
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: SizedBox(
            height: AppSizes.segmentedTabs,
            child: Row(
              children: [
                for (var i = 0; i < tabs.length; i++) ...[
                  if (i > 0)
                    VerticalDivider(
                      width: 1,
                      thickness: 1,
                      color: onDark ? Colors.transparent : colors.border,
                    ),
                  Expanded(
                    child: _Segment(
                      label: tabs[i].$2,
                      selected: tabs[i].$1 == value,
                      motion: motion,
                      colors: colors,
                      typography: typography,
                      onDark: onDark,
                      onTap: () {
                        if (tabs[i].$1 == value) return;
                        HapticFeedback.selectionClick();
                        onChanged(tabs[i].$1);
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Segment extends StatelessWidget {
  const _Segment({
    required this.label,
    required this.selected,
    required this.motion,
    required this.colors,
    required this.typography,
    required this.onTap,
    this.onDark = false,
  });

  final bool onDark;

  final String label;
  final bool selected;
  final Duration motion;
  final AppColorTokens colors;
  final AppTypographyTokens typography;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          // Owner 2026-09-29 (2nd pass): no gold tint and no underline —
          // the selected section is told apart by bold, darker text only.
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              child: FittedBox(
                fit: BoxFit.scaleDown,
                child: AnimatedDefaultTextStyle(
                  duration: motion,
                  style: typography.button.copyWith(
                    fontSize: 13,
                    color: onDark
                        ? (selected
                            ? Colors.white
                            : Colors.white.withValues(alpha: 0.7))
                        : (selected ? colors.text : colors.textSecondary),
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  ),
                  textAlign: TextAlign.center,
                  child: Text(label, textAlign: TextAlign.center),
                ),
              ),
            ),
          ),
        ),
      );
}

/// Filter chips row (Active / Archive / Closed …).
class FilterChips<T> extends StatelessWidget {
  const FilterChips({
    required this.value,
    required this.options,
    required this.onChanged,
    super.key,
    this.padding = const EdgeInsets.symmetric(
      horizontal: AppSpacing.screenSide,
    ),
  });

  final T value;
  final List<(T, String)> options;
  final ValueChanged<T> onChanged;

  /// Owner 2026-10-16: zero when the chips share a row with other controls.
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: padding,
        child: Row(
          children: [
            for (final (key, label) in options) ...[
              AppChip(
                label: label,
                selected: key == value,
                onTap: () => onChanged(key),
              ),
              const SizedBox(width: AppSpacing.sm),
            ],
          ],
        ),
      );
}

/// Owner 2026-10-01: swipe left / right inside a screen moves to the
/// next / previous section (Instagram-like). A swipe that starts at the
/// left edge is left alone — that is "back" (iPhone); horizontal lists
/// inside (chips, photo strips) keep their own scroll, they win the
/// gesture first. Bottom-nav sections never switch by swipe.
///
/// Owner 2026-10-19 (Instagram, smooth): the section follows the finger;
/// let go past the threshold and it slides away while the next one glides
/// in (also after a tap on a tab); short of it, it springs back. No
/// vibration on a swipe. With [slideChild] false the screen keeps still
/// (a profile's header) and only the parts wrapped in [TabSwipeSlide]
/// move.
class TabSwipe<T> extends StatefulWidget {
  const TabSwipe({
    required this.value,
    required this.values,
    required this.onChanged,
    required this.child,
    this.slideChild = true,
    super.key,
  });

  final T value;
  final List<T> values;
  final ValueChanged<T> onChanged;
  final Widget child;

  /// Move the whole [child]; false: only its [TabSwipeSlide] parts.
  final bool slideChild;

  /// The back gesture's strip at the left edge.
  static const edge = 24.0;

  /// A fling this fast (px/s) or a drag this long switches.
  static const _minVelocity = 350.0;
  static const _minDistance = 80.0;

  /// How far the section is pulled now, in pixels (0 at rest), for a tab
  /// indicator that follows the finger; null outside a [TabSwipe].
  static ValueListenable<double>? dragOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<_TabSwipeScope>()?.drag;

  @override
  State<TabSwipe<T>> createState() => _TabSwipeState<T>();
}

class _TabSwipeState<T> extends State<TabSwipe<T>>
    with SingleTickerProviderStateMixin {
  /// The section's horizontal shift in pixels.
  late final AnimationController _shift = AnimationController.unbounded(
    vsync: this,
  );

  /// 1 while settled; it fades up while the next section glides in.
  final _fade = ValueNotifier<double>(1);

  /// Only the finger's pull (for the tab indicator).
  final _drag = ValueNotifier<double>(0);

  /// The value change came from this widget's own swipe.
  bool _ownChange = false;

  static const _out = Duration(milliseconds: 150);
  static const _in = Duration(milliseconds: 260);

  double get _width {
    // Not Element.size: a tab tap changes the value during a build.
    final box = context.findRenderObject();
    return box is RenderBox && box.hasSize
        ? box.size.width
        : MediaQuery.sizeOf(context).width;
  }

  bool get _reduce => context.reduceMotion;

  @override
  void didUpdateWidget(TabSwipe<T> old) {
    super.didUpdateWidget(old);
    if (widget.value != old.value && !_ownChange) {
      // A tap on a tab: the new section glides in from its side.
      final from = old.values.indexOf(old.value);
      final to = widget.values.indexOf(widget.value);
      if (from >= 0 && to >= 0 && from != to) _enter(forward: to > from);
    }
    if (widget.value != old.value) _ownChange = false;
  }

  @override
  void dispose() {
    _shift.dispose();
    _fade.dispose();
    _drag.dispose();
    super.dispose();
  }

  /// Owner 2026-10-19 («данные прыгают», on every screen): the next
  /// section is put in place at once (Instagram) — no glide from the side,
  /// no fade; only the finger moves a section during a swipe.
  void _enter({required bool forward}) {
    _drag.value = 0;
    _shift.value = 0;
    _fade.value = 1;
  }

  int get _index => widget.values.indexOf(widget.value);

  void _update(DragUpdateDetails d) {
    final i = _index;
    if (i < 0) return;
    var dx = d.delta.dx;
    final next = _shift.value + dx;
    // No section on that side: a stiff rubber band.
    final towardMissing =
        (next < 0 && i >= widget.values.length - 1) || (next > 0 && i <= 0);
    if (towardMissing) dx *= 0.25;
    _shift.value += dx;
    _fade.value = 1;
    _drag.value = _shift.value;
  }

  void _end(DragEndDetails d) {
    final i = _index;
    if (i < 0) return;
    final v = d.primaryVelocity ?? 0;
    final dx = _shift.value;
    final forward = v < -TabSwipe._minVelocity ||
        (v <= TabSwipe._minVelocity && dx < -TabSwipe._minDistance);
    final backward = v > TabSwipe._minVelocity ||
        (v >= -TabSwipe._minVelocity && dx > TabSwipe._minDistance);
    final next = forward && !backward
        ? i + 1
        : backward && !forward
            ? i - 1
            : i;
    if (next == i || next < 0 || next >= widget.values.length) {
      _drag.value = 0;
      if (_reduce) {
        _shift.value = 0;
      } else {
        _shift.animateTo(0, duration: _in, curve: Curves.easeOutCubic);
      }
      return;
    }
    void change() {
      if (!mounted) return;
      _ownChange = true;
      widget.onChanged(widget.values[next]);
      _enter(forward: next > i);
    }

    if (_reduce) {
      change();
      return;
    }
    // The section slides away the way the finger went, then the next one
    // glides in from the other side.
    final target = (next > i ? -1 : 1) * _width;
    _shift
        .animateTo(target, duration: _out, curve: Curves.easeIn)
        .whenComplete(change);
  }

  @override
  Widget build(BuildContext context) {
    final moving = _TabSwipeScope(
      shift: _shift,
      fade: _fade,
      drag: _drag,
      child:
          widget.slideChild ? TabSwipeSlide(child: widget.child) : widget.child,
    );
    return RawGestureDetector(
      behavior: HitTestBehavior.translucent,
      gestures: {
        _EdgeAwareDrag: GestureRecognizerFactoryWithHandlers<_EdgeAwareDrag>(
          _EdgeAwareDrag.new,
          (r) => r
            ..onStart = (_) {
              _shift.stop();
            }
            ..onUpdate = _update
            ..onEnd = _end
            ..onCancel = () {
              _end(DragEndDetails(primaryVelocity: 0));
            },
        ),
      },
      child: moving,
    );
  }
}

class _TabSwipeScope extends InheritedWidget {
  const _TabSwipeScope({
    required this.shift,
    required this.fade,
    required this.drag,
    required super.child,
  });

  final Animation<double> shift;
  final ValueListenable<double> fade;
  final ValueListenable<double> drag;

  @override
  bool updateShouldNotify(_TabSwipeScope old) =>
      shift != old.shift || fade != old.fade || drag != old.drag;
}

/// The part of a [TabSwipe] screen that moves with the finger and glides
/// between sections (a profile's grid under a header that stays still).
class TabSwipeSlide extends StatelessWidget {
  const TabSwipeSlide({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<_TabSwipeScope>();
    if (scope == null) return child;
    return AnimatedBuilder(
      animation: Listenable.merge([scope.shift, scope.fade]),
      builder: (context, child) {
        final f = scope.fade.value;
        final moved = Transform.translate(
          offset: Offset(scope.shift.value, 0),
          child: child,
        );
        return f >= 1 ? moved : Opacity(opacity: f, child: moved);
      },
      // Only the shift changes per frame, not the section's widgets.
      child: RepaintBoundary(child: child),
    );
  }
}

class _EdgeAwareDrag extends HorizontalDragGestureRecognizer {
  @override
  bool isPointerAllowed(PointerEvent event) =>
      event.position.dx > TabSwipe.edge && super.isPointerAllowed(event);
}

/// Owner 2026-10-19 (Instagram, «вот так немного слайд делаешь и виден
/// контент в том разделе»): sections side by side as pages — while the
/// finger drags, the next section slides in with its real content (both
/// ways); a tap on a tab slides to it (~250 ms). Every section stays alive
/// once built (its scroll position, its lists), nothing fades or blinks.
/// A swipe that starts at the left edge is left to "back".
class SwipePages<T> extends StatefulWidget {
  const SwipePages({
    required this.value,
    required this.values,
    required this.onChanged,
    required this.pageBuilder,
    super.key,
  });

  final T value;
  final List<T> values;
  final ValueChanged<T> onChanged;
  final Widget Function(BuildContext context, T value) pageBuilder;

  @override
  State<SwipePages<T>> createState() => _SwipePagesState<T>();
}

class _SwipePagesState<T> extends State<SwipePages<T>> {
  late final PageController _pages = PageController(
    initialPage: math.max(0, widget.values.indexOf(widget.value)),
  );

  /// The page the controller is on or animating to.
  late int _target = math.max(0, widget.values.indexOf(widget.value));

  /// A tap's slide is running (the pages it passes are not chosen).
  bool _animating = false;

  @override
  void didUpdateWidget(SwipePages<T> old) {
    super.didUpdateWidget(old);
    final i = widget.values.indexOf(widget.value);
    if (i < 0 || i == _target) return;
    _target = i;
    if (!_pages.hasClients) return;
    // A tap on a tab: slide to it.
    if (context.reduceMotion) {
      _pages.jumpToPage(i);
    } else {
      _animating = true;
      unawaited(
        _pages
            .animateToPage(
              i,
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOutCubic,
            )
            .whenComplete(() => _animating = false),
      );
    }
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PageView.builder(
        controller: _pages,
        itemCount: widget.values.length,
        onPageChanged: (i) {
          // Mid-animation pages of a tap are passed by, not chosen.
          if (_animating && i != _target) return;
          _target = i;
          if (widget.values[i] != widget.value) {
            widget.onChanged(widget.values[i]);
          }
        },
        itemBuilder: (context, i) => _KeepPage(
          child: widget.pageBuilder(context, widget.values[i]),
        ),
      );
}

class _KeepPage extends StatefulWidget {
  const _KeepPage({required this.child});

  final Widget child;

  @override
  State<_KeepPage> createState() => _KeepPageState();
}

class _KeepPageState extends State<_KeepPage>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}
