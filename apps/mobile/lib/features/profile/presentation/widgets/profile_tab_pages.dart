import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';

/// Owner 2026-10-19 (Instagram, «вкладки прыгают»): a profile laid out the
/// way Instagram does it — the header scrolls away, the row of tabs sticks
/// to the top, and the tabs are pages side by side: a swipe moves the page
/// with the finger (the tab line follows it), a tap glides to the page.
/// Every page is kept alive once built, so going back to a tab shows it
/// exactly as it was — nothing is rebuilt, reloaded, faded or slid in, and
/// no page changes the height of another.
class ProfileTabPages extends StatefulWidget {
  const ProfileTabPages({
    required this.header,
    required this.tabBar,
    required this.pages,
    this.onRefresh,
    this.initialPage = 0,
    this.onPage,
    this.onNearEnd,
    this.pagePadding,
    this.tabBarHeight = AppSizes.touchTarget,
    super.key,
  });

  /// The sticky tab row's height.
  final double tabBarHeight;

  /// Everything above the tabs (avatar, counters, bio, buttons).
  final Widget header;

  /// The sticky row of tabs; [ProfileTabPages.controllerOf] gives it the
  /// page controller (the line follows the swipe, a tap animates).
  final Widget tabBar;

  final List<Widget> pages;
  final int initialPage;
  final ValueChanged<int>? onPage;

  /// A page scrolled near its end (load the next part of its list).
  final void Function(int page)? onNearEnd;

  /// Padding around each page's content (null: the screen's side margins).
  final EdgeInsetsGeometry Function(int page)? pagePadding;

  /// Pull to refresh; null when the screen already has its own.
  final Future<void> Function()? onRefresh;

  /// The page controller of the nearest [ProfileTabPages].
  static PageController? controllerOf(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<_ProfilePagesScope>()
      ?.controller;

  @override
  State<ProfileTabPages> createState() => _ProfileTabPagesState();
}

class _ProfileTabPagesState extends State<ProfileTabPages> {
  late final PageController _pages =
      PageController(initialPage: widget.initialPage);

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return _ProfilePagesScope(
      controller: _pages,
      child: _refreshable(
        context,
        NestedScrollView(
          headerSliverBuilder: (context, _) => [
            SliverToBoxAdapter(child: widget.header),
            SliverOverlapAbsorber(
              handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
              sliver: SliverPersistentHeader(
                pinned: true,
                delegate: _TabBarDelegate(
                  child: widget.tabBar,
                  color: colors.bg,
                  height: widget.tabBarHeight,
                ),
              ),
            ),
          ],
          // Owner 2026-10-22: on a pushed profile the first tab's drag to the
          // right goes «back»; the other tabs swipe as before.
          body: BackAwarePages(
            controller: _pages,
            child: PageView.builder(
              controller: _pages,
              physics: BackAwarePages.physicsFor(context),
              itemCount: widget.pages.length,
              onPageChanged: widget.onPage,
              itemBuilder: (context, i) => _KeepAlive(
                child: Builder(
                  builder: (context) =>
                      NotificationListener<ScrollNotification>(
                    onNotification: (n) {
                      if (n.depth == 0 &&
                          n.metrics.axis == Axis.vertical &&
                          n.metrics.extentAfter < 320) {
                        widget.onNearEnd?.call(i);
                      }
                      return false;
                    },
                    child: CustomScrollView(
                      key: PageStorageKey<int>(i),
                      physics: const AlwaysScrollableScrollPhysics(),
                      slivers: [
                        SliverOverlapInjector(
                          handle:
                              NestedScrollView.sliverOverlapAbsorberHandleFor(
                            context,
                          ),
                        ),
                        SliverPadding(
                          padding: widget.pagePadding?.call(i) ??
                              const EdgeInsets.fromLTRB(
                                AppSpacing.screenSide,
                                AppSpacing.sm,
                                AppSpacing.screenSide,
                                AppSpacing.xxl,
                              ),
                          sliver: widget.pages[i] is ProfileSliverPage
                              ? widget.pages[i]
                              : SliverToBoxAdapter(child: widget.pages[i]),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _refreshable(BuildContext context, Widget child) {
    final onRefresh = widget.onRefresh;
    if (onRefresh == null) return child;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AppRefreshIndicator(
      color: colors.gold,
      backgroundColor: colors.sheet,
      // The pages' lists deliver the pull; it counts only with the header
      // back at the top, and the spinner sits at the top edge.
      notificationPredicate: nestedScrollNotificationPredicate,
      onRefresh: onRefresh,
      child: child,
    );
  }
}

/// 2026-10-26 (smoothness P4): a page given as a sliver instead of a box, so
/// a long grid inside it is built lazily (only the rows near the screen)
/// instead of all at once by a `shrinkWrap` grid. [minExtent] is the page's
/// minimum height — the same as a `ConstrainedBox(minHeight:)` around a box
/// page: a short page still reaches it, a long one is not touched.
class ProfileSliverPage extends StatelessWidget {
  const ProfileSliverPage({
    required this.sliver,
    this.minExtent = 0,
    super.key,
  });

  final Widget sliver;
  final double minExtent;

  @override
  Widget build(BuildContext context) =>
      SliverMinExtent(minExtent: minExtent, sliver: sliver);
}

/// A sliver that takes at least [minExtent] of scroll space: the child is
/// laid out as is, and when it is shorter the rest is empty space below it
/// (what `ConstrainedBox(minHeight:)` around a top-aligned `Column` does).
class SliverMinExtent extends SingleChildRenderObjectWidget {
  const SliverMinExtent({
    required this.minExtent,
    required Widget sliver,
    super.key,
  }) : super(child: sliver);

  final double minExtent;

  @override
  RenderSliverMinExtent createRenderObject(BuildContext context) =>
      RenderSliverMinExtent(minExtent);

  @override
  void updateRenderObject(
    BuildContext context,
    RenderSliverMinExtent renderObject,
  ) {
    renderObject.minExtent = minExtent;
  }
}

class RenderSliverMinExtent extends RenderProxySliver {
  RenderSliverMinExtent(this._minExtent);

  double _minExtent;
  double get minExtent => _minExtent;
  set minExtent(double value) {
    if (value == _minExtent) return;
    _minExtent = value;
    markNeedsLayout();
  }

  @override
  void performLayout() {
    final child = this.child!..layout(constraints, parentUsesSize: true);
    final g = child.geometry!;
    if (g.scrollOffsetCorrection != null || g.scrollExtent >= _minExtent) {
      geometry = g;
      return;
    }
    final paint = calculatePaintOffset(constraints, from: 0, to: _minExtent);
    geometry = SliverGeometry(
      scrollExtent: _minExtent,
      paintExtent: paint,
      layoutExtent: paint,
      maxPaintExtent: math.max(g.maxPaintExtent, _minExtent),
      cacheExtent: calculateCacheOffset(constraints, from: 0, to: _minExtent),
      hitTestExtent: paint,
      hasVisualOverflow: g.hasVisualOverflow,
    );
  }
}

class _ProfilePagesScope extends InheritedWidget {
  const _ProfilePagesScope({required this.controller, required super.child});

  final PageController controller;

  @override
  bool updateShouldNotify(_ProfilePagesScope old) =>
      controller != old.controller;
}

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  _TabBarDelegate({
    required this.child,
    required this.color,
    required this.height,
  });

  final Widget child;
  final Color color;
  final double height;

  @override
  double get minExtent => height;

  @override
  double get maxExtent => height;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlaps) =>
      ColoredBox(
        color: color,
        // Exactly the row's height, whatever the child's own (a pinned
        // header must paint as much as it takes).
        child: SizedBox.expand(
          child: Align(alignment: Alignment.bottomCenter, child: child),
        ),
      );

  @override
  bool shouldRebuild(_TabBarDelegate old) =>
      child != old.child || color != old.color || height != old.height;
}

/// Keeps a page (its scroll position, its lists, its providers) alive when
/// another tab is shown.
class _KeepAlive extends StatefulWidget {
  const _KeepAlive({required this.child});

  final Widget child;

  @override
  State<_KeepAlive> createState() => _KeepAliveState();
}

class _KeepAliveState extends State<_KeepAlive>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}

/// Where the gold line of a tab row stands: follows the page while it is
/// swiped (a fraction between two tabs), the selected tab otherwise.
double profileTabPosition(PageController? pages, int selected) {
  if (pages == null || !pages.hasClients || pages.positions.length != 1) {
    return selected.toDouble();
  }
  return pages.page ?? selected.toDouble();
}
