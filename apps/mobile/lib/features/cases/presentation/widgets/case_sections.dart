import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';

/// The sections of a case screen (owner 2026-11-05): at most four at a time.
enum CaseSection { overview, bids, files, tasks, history }

/// `?tab=` of a case link. The old tab names keep working: Docs now lives in
/// Files, Time in Tasks, Updates and Activity in History.
CaseSection caseSectionFromName(String? name) => switch (name) {
      'bids' => CaseSection.bids,
      'files' || 'docs' => CaseSection.files,
      'tasks' || 'time' => CaseSection.tasks,
      'updates' || 'activity' || 'history' => CaseSection.history,
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

  List<String> get items => _items;
  int get index => _index;
  PageController? get pages => _pages;

  /// Call from a post-frame callback: it may rebuild the bar.
  void publish({
    required List<String> items,
    required int index,
    required PageController pages,
  }) {
    if (_disposed) return;
    final same = identical(pages, _pages) &&
        index == _index &&
        listEquals(items, _items);
    if (same) return;
    _items = items;
    _index = index;
    _pages = pages;
    notifyListeners();
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
            onChanged: (i) {
              if (!pages.hasClients) return;
              pages.animateToPage(
                i,
                duration: context.reduceMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
              );
            },
          );
        },
      );
}
