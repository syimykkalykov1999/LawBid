import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_tab_pages.dart'
    show SliverMinExtent;

/// Where a case link opens (`?tab=`): the section and, in a case in work, the
/// tab inside it. Owner 2026-11-05: Overview = Case + Activity, Files =
/// Documents + Photos, Tasks = Tasks + Time.
enum CaseSection {
  overview(0, 0),
  activity(0, 1),
  bids(1, 0),
  docs(1, 0),
  photos(1, 1),
  tasks(2, 0),
  time(2, 1);

  const CaseSection(this.page, this.tab);

  /// The section's page in a case in work (Overview, Files, Tasks).
  final int page;

  /// The tab inside that section.
  final int tab;
}

/// The old tab names keep working: each opens the place that took it over.
CaseSection caseSectionFromName(String? name) => switch (name) {
      'bids' => CaseSection.bids,
      'files' || 'docs' => CaseSection.docs,
      'photos' => CaseSection.photos,
      'tasks' => CaseSection.tasks,
      'time' => CaseSection.time,
      'updates' || 'activity' || 'history' => CaseSection.activity,
      _ => CaseSection.overview,
    };

/// What the top bar of a case screen shows. The body knows the sections and
/// owns the pages; the bar sits above it in the Scaffold, so the body
/// publishes them here and the bar listens.
class CaseSectionsBar extends ChangeNotifier {
  List<String> _items = const [];
  int _index = 0;
  PageController? _pages;
  bool _disposed = false;
  bool _overviewShown = true;

  /// The Overview is on screen: its action buttons belong at the bottom.
  bool get overviewShown => _overviewShown;

  List<String> get items => _items;
  int get index => _index;
  PageController? get pages => _pages;

  /// Call from a post-frame callback: it may rebuild the bar.
  void publish({
    required List<String> items,
    required int index,
    required PageController pages,
    required bool overviewShown,
  }) {
    if (_disposed) return;
    final same = identical(pages, _pages) &&
        overviewShown == _overviewShown &&
        index == _index &&
        listEquals(items, _items);
    if (same) return;
    _items = items;
    _index = index;
    _pages = pages;
    _overviewShown = overviewShown;
    notifyListeners();
  }

  /// Slides to section [i] (a button elsewhere on the screen asked for it).
  void show(int i, {required bool reduceMotion}) {
    final pages = _pages;
    if (pages == null || !pages.hasClients) return;
    pages.animateToPage(
      i,
      duration:
          reduceMotion ? Duration.zero : const Duration(milliseconds: 250),
      curve: Curves.easeOutCubic,
    );
  }

  /// The body is going away (its pages with it): back to the plain title.
  void release(PageController pages) {
    if (!identical(pages, _pages)) return;
    _items = const [];
    _pages = null;
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (!_disposed) notifyListeners();
    });
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// The middle of a case's top bar: the sections once the case has loaded,
/// [fallback] (the screen's title) before that.
class CaseSectionsTitle extends StatelessWidget {
  const CaseSectionsTitle({
    required this.bar,
    required this.fallback,
    super.key,
  });

  final CaseSectionsBar bar;
  final Widget fallback;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: bar,
        builder: (context, _) {
          final pages = bar.pages;
          if (pages == null || bar.items.isEmpty) return fallback;
          // The same frame and equal parts as «People / Posts / Topics».
          return PillTabs<int>(
            key: const ValueKey('case-sections'),
            value: bar.index,
            tabs: [for (final (i, label) in bar.items.indexed) (i, label)],
            padding: EdgeInsets.zero,
            labelSide: AppSpacing.xs / 2,
            onChanged: (i) => bar.show(i, reduceMotion: context.reduceMotion),
          );
        },
      );
}

/// Owner 2026-11-05: the tabs inside a section of a case in work, as a sliver
/// page: equal parts over the whole width, a thin gold line under the chosen
/// one, 44 pt to tap of which only the middle is drawn. A tap changes the tab;
/// a swipe stays with the sections. A tab is built when first opened and kept.
class CaseSubTabs extends StatefulWidget {
  const CaseSubTabs({
    required this.labels,
    required this.builders,
    required this.index,
    required this.onChanged,
    this.minHeight = 0,
    this.sliverTabs = const {},
    super.key,
  });

  final List<String> labels;
  final List<WidgetBuilder> builders;
  final int index;
  final ValueChanged<int> onChanged;
  final double minHeight;

  /// App audit 2026-10-26 A16: the tabs whose builder gives a sliver (a long
  /// list built lazily, row by row, as it scrolls in); the others give a box.
  final Set<int> sliverTabs;

  @override
  State<CaseSubTabs> createState() => _CaseSubTabsState();
}

class _CaseSubTabsState extends State<CaseSubTabs>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(
    length: widget.labels.length,
    initialIndex: widget.index,
    vsync: this,
  );
  late final Set<int> _opened = {widget.index};

  @override
  void didUpdateWidget(CaseSubTabs old) {
    super.didUpdateWidget(old);
    if (widget.index != _tabs.index) _tabs.index = widget.index;
    _opened.add(widget.index);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // 11 pt of nothing above and below keeps the row half the sections' look.
    const air = (AppSizes.touchTarget - AppSizes.segmentedTabs / 2 - 6) / 2;
    return SliverMainAxisGroup(
      slivers: [
        PinnedHeaderSliver(
          child: ColoredBox(
            color: colors.bg,
            child: TabBar(
              key: const ValueKey('case-sub-tabs'),
              controller: _tabs,
              onTap: widget.onChanged,
              labelColor: colors.text,
              unselectedLabelColor: colors.textSecondary,
              labelStyle: type.caption.copyWith(fontWeight: FontWeight.w600),
              unselectedLabelStyle: type.caption,
              labelPadding: EdgeInsets.zero,
              dividerColor: colors.bg,
              overlayColor: WidgetStateProperty.all(
                colors.bg.withValues(alpha: 0),
              ),
              indicatorSize: TabBarIndicatorSize.tab,
              indicator: UnderlineTabIndicator(
                borderSide: BorderSide(color: colors.gold),
                insets: const EdgeInsets.only(
                  left: AppSpacing.lg,
                  right: AppSpacing.lg,
                  bottom: air,
                ),
              ),
              tabs: [
                for (final label in widget.labels)
                  Tab(
                    height: AppSizes.touchTarget,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.xs,
                      ),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(label, maxLines: 1),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        // The same page as a ConstrainedBox(minHeight) around the tabs'
        // Column, as slivers: a long list's rows are built only as they
        // scroll in (A16), the hidden tabs are kept.
        SliverMinExtent(
          minExtent: widget.minHeight,
          sliver: SliverMainAxisGroup(
            slivers: [
              for (final i in _opened.toList()..sort())
                SliverVisibility(
                  visible: i == widget.index,
                  maintainState: true,
                  sliver: widget.sliverTabs.contains(i)
                      ? Builder(builder: widget.builders[i])
                      : SliverToBoxAdapter(
                          child: Builder(builder: widget.builders[i]),
                        ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
