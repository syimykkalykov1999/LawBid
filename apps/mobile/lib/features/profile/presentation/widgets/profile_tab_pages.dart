import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

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
    required this.onRefresh,
    this.initialPage = 0,
    this.onPage,
    this.onNearEnd,
    this.pagePadding,
    super.key,
  });

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

  final Future<void> Function() onRefresh;

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
      child: RefreshIndicator(
        color: colors.gold,
        backgroundColor: colors.sheet,
        // The pages' own vertical lists pull to refresh too.
        notificationPredicate: (n) => n.metrics.axis == Axis.vertical,
        onRefresh: widget.onRefresh,
        child: NestedScrollView(
          headerSliverBuilder: (context, _) => [
            SliverToBoxAdapter(child: widget.header),
            SliverOverlapAbsorber(
              handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
              sliver: SliverPersistentHeader(
                pinned: true,
                delegate: _TabBarDelegate(
                  child: widget.tabBar,
                  color: colors.bg,
                ),
              ),
            ),
          ],
          body: PageView.builder(
            controller: _pages,
            itemCount: widget.pages.length,
            onPageChanged: widget.onPage,
            itemBuilder: (context, i) => _KeepAlive(
              child: Builder(
                builder: (context) => NotificationListener<ScrollNotification>(
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
                        handle: NestedScrollView.sliverOverlapAbsorberHandleFor(
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
                        sliver: SliverToBoxAdapter(child: widget.pages[i]),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
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
  _TabBarDelegate({required this.child, required this.color});

  final Widget child;
  final Color color;

  @override
  double get minExtent => AppSizes.touchTarget;

  @override
  double get maxExtent => AppSizes.touchTarget;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlaps) =>
      ColoredBox(color: color, child: child);

  @override
  bool shouldRebuild(_TabBarDelegate old) =>
      child != old.child || color != old.color;
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
