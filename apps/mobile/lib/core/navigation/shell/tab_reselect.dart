import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/widgets/feedback/app_refresh_indicator.dart';

/// Owner 2026-10-06 (Instagram-style): tapping the bottom-nav tab that is
/// already selected scrolls that tab back to the top and refreshes it.
/// Owner 2026-10-19 (Instagram): away from the top the tap only scrolls
/// back up; a tap with the tab already at the top refreshes it (so a
/// second tap after the scroll refreshes).
///
/// Works for every tab and every list inside it without each screen
/// opting in: [scrollToTopAndRefresh] walks the visible part of the tab
/// (skipping hidden branches, hidden sub-tabs of an `IndexedStack`, and
/// off-screen `PageView` / `TabBarView` pages), scrolls each visible
/// vertical list back to its start, then starts the outermost visible
/// pull-to-refresh so the user sees the same spinner as when pulling down.
/// A tab with no pull-to-refresh just scrolls to the top.
Future<void> scrollToTopAndRefresh(
  BuildContext root, {
  bool reduceMotion = false,
}) =>
    _scrollUp(root, reduceMotion: reduceMotion, refresh: true);

/// Owner 2026-10-19: only the scroll back to the top (the feed's «New
/// posts» pill refreshes on its own).
Future<void> scrollVisibleToTop(
  BuildContext root, {
  bool reduceMotion = false,
}) =>
    _scrollUp(root, reduceMotion: reduceMotion, refresh: false);

Future<void> _scrollUp(
  BuildContext root, {
  required bool reduceMotion,
  required bool refresh,
}) async {
  final rootBox = root.findRenderObject();
  if (rootBox is! RenderBox || !rootBox.hasSize) return;
  final bounds = _globalRect(rootBox);

  final scrollables = <ScrollableState>[];
  final refreshers = <AppRefreshIndicatorState>[];
  void visit(Element element) {
    final widget = element.widget;
    // Hidden subtrees: inactive shell branches (Offstage + TickerMode),
    // hidden Visibility children, and the like.
    if (widget is Offstage && widget.offstage) return;
    if (widget is Visibility && !widget.visible) return;
    if (widget is TickerMode && !widget.enabled) return;
    // IndexedStack (the shell branches, the Feed's Posts | Cases): only
    // the selected child is on screen.
    final render = element is RenderObjectElement ? element.renderObject : null;
    if (render is RenderIndexedStack) {
      var i = 0;
      element.visitChildElements((child) {
        if (i++ == render.index) visit(child);
      });
      return;
    }
    if (element is StatefulElement && _onScreen(element, bounds)) {
      final state = element.state;
      if (state is ScrollableState &&
          axisDirectionToAxis(state.axisDirection) == Axis.vertical) {
        scrollables.add(state);
      } else if (state is AppRefreshIndicatorState) {
        refreshers.add(state);
      }
    }
    element.visitChildElements(visit);
  }

  root.visitChildElements(visit);

  final away = scrollables.any(_awayFromTop);
  await Future.wait([
    for (final s in scrollables) _toTop(s.position, reduceMotion),
  ]);
  if (!refresh || away || refreshers.isEmpty) return;
  final refresher = refreshers.first;
  if (refresher.mounted) await refresher.show();
}

bool _awayFromTop(ScrollableState s) {
  final p = s.position;
  // A few pixels of a bounce do not count.
  return p.hasContentDimensions &&
      p.hasPixels &&
      p.pixels > p.minScrollExtent + 4;
}

Rect _globalRect(RenderBox box) => MatrixUtils.transformRect(
      box.getTransformTo(null),
      Offset.zero & box.size,
    );

/// Whether [element]'s box is laid out and its centre lies within [bounds]
/// (an off-screen `PageView` page is laid out but outside the screen).
bool _onScreen(Element element, Rect bounds) {
  final box = element.findRenderObject();
  if (box is! RenderBox || !box.attached || !box.hasSize) return false;
  return bounds.contains(_globalRect(box).center);
}

Future<void> _toTop(ScrollPosition position, bool reduceMotion) async {
  if (!position.hasContentDimensions || !position.hasPixels) return;
  final top = position.minScrollExtent;
  if (position.pixels <= top) return;
  if (reduceMotion) {
    position.jumpTo(top);
    return;
  }
  // Far down a long feed: jump to one screen from the top first, so the
  // animation stays short instead of racing through every post.
  final viewport = position.viewportDimension;
  if (position.pixels - top > viewport * 2) position.jumpTo(top + viewport);
  await position.animateTo(
    top,
    duration: AppMotion.pageEnter,
    curve: AppMotion.enterCurve,
  );
}
