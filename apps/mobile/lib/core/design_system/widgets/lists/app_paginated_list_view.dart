import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;
import 'package:flutter/scheduler.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/buttons/app_button.dart';
import 'package:lawbid/core/design_system/widgets/feedback/app_refresh_indicator.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// State of the "next page" slot at the end of a paginated list
/// (docs/01 §8.3 "Pagination-loader").
enum AppPaginationStatus {
  /// More pages exist and none is loading — nothing is shown; scrolling
  /// near the end requests the next page.
  idle,

  /// The next page is being fetched.
  loading,

  /// Fetching the next page failed — message + Retry at the list end.
  error,

  /// The cursor is exhausted (`meta.nextCursor == null`, docs/01 §7).
  end,
}

/// Strings for the footer — always `t('...')` from the caller.
@immutable
class AppPaginationLabels {
  const AppPaginationLabels({
    required this.loadingMore,
    required this.error,
    required this.retry,
    required this.end,
  });

  final String loadingMore;
  final String error;
  final String retry;
  final String end;
}

/// Footer that closes a paginated list: spinner while loading more, a
/// compact error with Retry right where the failure happened (not a
/// full-screen error — the loaded rows stay usable), or a quiet
/// end-of-list mark (gold hairline + caption, echoing the scales' beam).
/// State changes cross-fade; instant under reduce-motion. Loading/error
/// are polite live regions so screen-reader users hear them.
class AppPaginationFooter extends StatelessWidget {
  const AppPaginationFooter({
    required this.status,
    required this.labels,
    required this.onRetry,
    super.key,
  });

  final AppPaginationStatus status;
  final AppPaginationLabels labels;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    final Widget content = switch (status) {
      AppPaginationStatus.idle => const SizedBox(
          key: ValueKey(AppPaginationStatus.idle),
          height: AppSpacing.xl,
        ),
      AppPaginationStatus.loading => Semantics(
          key: const ValueKey(AppPaginationStatus.loading),
          liveRegion: true,
          label: labels.loadingMore,
          excludeSemantics: true,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox.square(
                  dimension: AppSizes.footerSpinner,
                  child: CircularProgressIndicator(
                    strokeWidth: AppSizes.footerSpinnerStroke,
                    color: colors.gold,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Flexible(
                  child: Text(
                    labels.loadingMore,
                    style: typography.bodySmall
                        .copyWith(color: colors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
        ),
      AppPaginationStatus.error => Padding(
          key: const ValueKey(AppPaginationStatus.error),
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          child: Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: colors.dangerTint,
              borderRadius: BorderRadius.circular(AppRadii.field),
            ),
            child: Column(
              children: [
                Semantics(
                  liveRegion: true,
                  child: Row(
                    children: [
                      ExcludeSemantics(
                        child: AppIcon(
                          AppIcons.errorOutlineRounded,
                          size: AppSizes.iconSm,
                          color: colors.danger,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          labels.error,
                          style:
                              typography.bodySmall.copyWith(color: colors.text),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: labels.retry,
                  icon: AppIcons.refreshRounded,
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: onRetry,
                ),
              ],
            ),
          ),
        ),
      AppPaginationStatus.end => Padding(
          key: const ValueKey(AppPaginationStatus.end),
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
          // Centered: equal lines on both sides, the text capped at 60%
          // of the width so a long translation wraps instead of shifting.
          child: LayoutBuilder(
            builder: (context, box) => Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Expanded(child: _Hairline(color: colors.goldStroke)),
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: box.maxWidth * 0.6),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                    child: Text(
                      labels.end,
                      textAlign: TextAlign.center,
                      style: typography.bodySmall
                          .copyWith(color: colors.textSecondary),
                    ),
                  ),
                ),
                Expanded(
                  child: _Hairline(color: colors.goldStroke, flip: true),
                ),
              ],
            ),
          ),
        ),
    };

    return AnimatedSwitcher(
      duration: context.reduceMotion ? Duration.zero : AppMotion.footerSwitch,
      switchInCurve: AppMotion.enterCurve,
      switchOutCurve: AppMotion.exitCurve,
      child: content,
    );
  }
}

/// Hairline fading out towards the list edges.
class _Hairline extends StatelessWidget {
  const _Hairline({required this.color, this.flip = false});

  final Color color;
  final bool flip;

  @override
  Widget build(BuildContext context) {
    final stops = [color.withValues(alpha: 0), color.withValues(alpha: 0.6)];
    return Container(
      height: 1,
      decoration: BoxDecoration(
        gradient:
            LinearGradient(colors: flip ? stops.reversed.toList() : stops),
      ),
    );
  }
}

/// Lazily-built list with cursor pagination (docs/01 §7 `meta.nextCursor`,
/// §8.3 "Pagination-loader"; `.cursorrules`: cursor-based only).
///
/// Presentational: the caller's controller owns the items and cursor. This
/// widget asks for the next page ([onLoadMore]) when the user scrolls within
/// [loadMoreExtent] of the end — or right after layout when the first page
/// does not even fill the viewport — but only while [status] is
/// [AppPaginationStatus.idle], so a failed page is never auto-retried in a
/// loop (the footer's Retry does that explicitly). Optional [onRefresh]
/// adds pull-to-refresh in brand gold; [header] scrolls with the list.
class AppPaginatedListView<T> extends StatefulWidget {
  const AppPaginatedListView({
    required this.items,
    required this.itemBuilder,
    required this.status,
    required this.labels,
    required this.onLoadMore,
    required this.onRetry,
    super.key,
    this.itemKey,
    this.header,
    this.footer,
    this.onRefresh,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.screenSide,
      AppSpacing.sm,
      AppSpacing.screenSide,
      AppSpacing.xxl,
    ),
    this.itemSpacing = AppSpacing.md,
    this.loadMoreExtent = 320,
    this.controller,
    this.scrollCacheExtent,
    this.animateChanges = false,
  });

  /// Owner row 95 (motion catalog C3 / C4, Telegram / WhatsApp chat list,
  /// `UITableView` row animations): a row that comes in grows in, a row
  /// that goes collapses, and a row that jumps up the list (a chat with a
  /// new message) collapses where it was and grows in where it lands, so
  /// the rows between slide instead of jumping. `AnimatedList`'s 300 ms
  /// insert/remove (`widgets/animated_scroll_view.dart`, BSD-3); the moved
  /// rows are the ones off the longest increasing run of old positions
  /// (the diff of flutter_chat_ui / Android `DiffUtil`, Apache-2.0).
  /// The first page, a page loaded at the end and big reloads never move.
  /// Needs [itemKey]. Reduce motion: no motion.
  final bool animateChanges;

  /// Owner 2026-10-19 (smooth scroll): how far past the screen rows are
  /// built ahead (null: Flutter's 250 px). A feed of screen-tall cards
  /// passes about a screen, so the next card is built and its pictures
  /// decoded before it scrolls in, not in the frame it appears.
  final ScrollCacheExtent? scrollCacheExtent;

  final List<T> items;
  final Widget Function(BuildContext context, T item, int index) itemBuilder;

  /// Stable key per item so row state survives inserts/removals.
  final Object Function(T item)? itemKey;
  final AppPaginationStatus status;
  final AppPaginationLabels labels;
  final VoidCallback onLoadMore;
  final VoidCallback onRetry;
  final Widget? header;

  /// Extra content after the pagination footer (e.g. a bulk action).
  final Widget? footer;
  final Future<void> Function()? onRefresh;
  final EdgeInsetsGeometry padding;
  final double itemSpacing;
  final double loadMoreExtent;
  final ScrollController? controller;

  @override
  State<AppPaginatedListView<T>> createState() =>
      _AppPaginatedListViewState<T>();
}

/// One row on screen: an item, or the ghost of one that left (collapsing).
class _Row<T> {
  _Row(this.item, this.key, {this.ghost = false});

  final T item;
  final Object key;
  final bool ghost;
}

class _AppPaginatedListViewState<T> extends State<AppPaginatedListView<T>>
    with TickerProviderStateMixin {
  /// Rows in motion: entering (forward) and ghosts (reverse), by key.
  final Map<Object, AnimationController> _entering = {};
  final Map<Object, AnimationController> _leaving = {};

  /// What is drawn while something moves (null: [AppPaginatedListView.items]).
  List<_Row<T>>? _rows;

  /// At most this many rows move in one change; more is a reload.
  static const int _maxMoving = 6;

  ScrollController? _ownController;
  ScrollController get _controller =>
      widget.controller ?? (_ownController ??= ScrollController());

  @override
  void initState() {
    super.initState();
    _scheduleFillCheck();
  }

  @override
  void didUpdateWidget(covariant AppPaginatedListView<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.items.length != widget.items.length ||
        oldWidget.status != widget.status) {
      _scheduleFillCheck();
    }
    if (widget.animateChanges &&
        widget.itemKey != null &&
        !identical(oldWidget.items, widget.items)) {
      _diff(oldWidget.items, widget.items);
    }
  }

  @override
  void dispose() {
    for (final c in [..._entering.values, ..._leaving.values]) {
      c.dispose();
    }
    _ownController?.dispose();
    super.dispose();
  }

  void _diff(List<T> before, List<T> after) {
    final keyOf = widget.itemKey!;
    if (before.isEmpty || context.reduceMotion) {
      _settleAll();
      return;
    }
    final oldKeys = [for (final x in before) keyOf(x)];
    final oldIndex = {for (var i = 0; i < oldKeys.length; i++) oldKeys[i]: i};
    final newKeys = [for (final x in after) keyOf(x)];
    final newSet = newKeys.toSet();
    // Kept rows in their new order, by their old index; the ones off the
    // longest increasing run moved.
    final kept = [
      for (final k in newKeys)
        if (oldIndex.containsKey(k)) k,
    ];
    final steady = _longestRun([for (final k in kept) oldIndex[k]!])
        .map((i) => kept[i])
        .toSet();
    final moved = {
      for (final k in kept)
        if (!steady.contains(k)) k,
    };
    final lastOld = oldKeys.last;
    final lastOldAt = newKeys.indexOf(lastOld);
    final inserted = <Object>{
      for (var i = 0; i < newKeys.length; i++)
        // A page loaded at the end is not «new»: only rows before the old
        // last row grow in.
        if (!oldIndex.containsKey(newKeys[i]) &&
            (lastOldAt < 0 || i < lastOldAt))
          newKeys[i],
    };
    final removed = [
      for (final k in oldKeys)
        if (!newSet.contains(k)) k,
    ];
    final changes = inserted.length + moved.length + removed.length;
    if (changes == 0 && _rows == null) return;
    if (changes > _maxMoving) {
      _settleAll();
      return;
    }
    // The rows to draw: the new list, with ghosts at the old places of the
    // removed and the moved ones (each right after its old neighbour).
    final ghosts = <Object, T>{
      for (final k in [...removed, ...moved]) k: before[oldIndex[k]!],
    };
    final rows = <_Row<T>>[
      for (var i = 0; i < after.length; i++) _Row(after[i], newKeys[i]),
    ];
    for (final k in ghosts.keys) {
      final at = oldIndex[k]!;
      // Find the nearest old row above it that is still on screen.
      var insertAt = 0;
      for (var j = at - 1; j >= 0; j--) {
        final above = oldKeys[j];
        final pos = rows.indexWhere((r) => !r.ghost && r.key == above);
        if (pos >= 0 && !moved.contains(above)) {
          insertAt = pos + 1;
          break;
        }
      }
      rows.insert(insertAt, _Row(ghosts[k] as T, _GhostKey(k), ghost: true));
    }
    for (final k in [...inserted, ...moved]) {
      _leaving.remove(_GhostKey(k))?.dispose();
      final c = _entering.remove(k) ??
          AnimationController(
            vsync: this,
            duration: AppMotion.listChange,
          );
      _entering[k] = c;
      c.forward(from: 0).whenComplete(() => _done(k, entering: true));
    }
    for (final k in ghosts.keys) {
      final g = _GhostKey(k);
      _leaving.remove(g)?.dispose();
      final c = AnimationController(
        vsync: this,
        duration: AppMotion.listChange,
        value: 1,
      );
      _leaving[g] = c;
      c.reverse().whenComplete(() => _done(g, entering: false));
    }
    _rows = rows;
  }

  void _done(Object key, {required bool entering}) {
    if (!mounted) return;
    final c = (entering ? _entering : _leaving)[key];
    if (c == null || c.isAnimating) return;
    (entering ? _entering : _leaving).remove(key)?.dispose();
    if (_entering.isEmpty && _leaving.isEmpty) {
      setState(() => _rows = null);
    } else if (!entering) {
      setState(() => _rows?.removeWhere((r) => r.key == key));
    }
  }

  void _settleAll() {
    for (final c in [..._entering.values, ..._leaving.values]) {
      c.dispose();
    }
    _entering.clear();
    _leaving.clear();
    _rows = null;
  }

  /// Indexes (into [xs]) of one longest strictly increasing run
  /// (patience sorting, O(n log n)).
  static List<int> _longestRun(List<int> xs) {
    if (xs.isEmpty) return const [];
    final tails = <int>[];
    final prev = List<int>.filled(xs.length, -1);
    for (var i = 0; i < xs.length; i++) {
      var lo = 0;
      var hi = tails.length;
      while (lo < hi) {
        final mid = (lo + hi) >> 1;
        if (xs[tails[mid]] < xs[i]) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      if (lo > 0) prev[i] = tails[lo - 1];
      if (lo == tails.length) {
        tails.add(i);
      } else {
        tails[lo] = i;
      }
    }
    final out = <int>[];
    for (var i = tails.last; i >= 0; i = prev[i]) {
      out.add(i);
    }
    return out.reversed.toList();
  }

  Widget _moving(Object key, Widget child) {
    final c = _entering[key] ?? _leaving[key];
    if (c == null) return child;
    final curved = CurvedAnimation(parent: c, curve: Curves.easeInOut);
    return SizeTransition(
      sizeFactor: curved,
      alignment: Alignment.topCenter,
      child: FadeTransition(opacity: c, child: child),
    );
  }

  /// After layout: if the list is already near its end (short first page),
  /// ask for more without waiting for a scroll that can never happen.
  void _scheduleFillCheck() {
    SchedulerBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_controller.hasClients) return;
      _maybeLoadMore(_controller.position);
    });
  }

  void _maybeLoadMore(ScrollMetrics metrics) {
    if (widget.status != AppPaginationStatus.idle) return;
    if (metrics.extentAfter <= widget.loadMoreExtent) widget.onLoadMore();
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth == 0 &&
        (notification is ScrollUpdateNotification ||
            notification is OverscrollNotification)) {
      _maybeLoadMore(notification.metrics);
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final hasHeader = widget.header != null;
    final hasFooter = widget.footer != null;
    final offset = hasHeader ? 1 : 0;
    final rows = _rows;
    final length = rows?.length ?? widget.items.length;
    // header? + items + pagination footer + extra footer?
    final count = offset + length + 1 + (hasFooter ? 1 : 0);

    Widget list = ListView.builder(
      controller: _controller,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: widget.padding,
      scrollCacheExtent: widget.scrollCacheExtent,
      itemCount: count,
      itemBuilder: (context, index) {
        if (hasHeader && index == 0) return widget.header;
        final itemIndex = index - offset;
        if (rows != null && itemIndex < rows.length) {
          final row = rows[itemIndex];
          final real = row.ghost ? -1 : widget.items.indexOf(row.item);
          final built = Padding(
            padding: EdgeInsets.only(bottom: widget.itemSpacing),
            child: widget.itemBuilder(context, row.item, real < 0 ? 0 : real),
          );
          return KeyedSubtree(
            key: ValueKey<Object>(row.key),
            child: _moving(
              row.key,
              row.ghost ? IgnorePointer(child: built) : built,
            ),
          );
        }
        if (itemIndex < widget.items.length) {
          final item = widget.items[itemIndex];
          return Padding(
            key: widget.itemKey == null
                ? null
                : ValueKey<Object>(widget.itemKey!(item)),
            padding: EdgeInsets.only(bottom: widget.itemSpacing),
            child: widget.itemBuilder(context, item, itemIndex),
          );
        }
        if (itemIndex == length) {
          // Nothing paginated here (e.g. a profile's posts tab): no empty
          // footer gap between the header and the extra footer.
          if (widget.items.isEmpty &&
              widget.status == AppPaginationStatus.idle) {
            return const SizedBox.shrink();
          }
          return AppPaginationFooter(
            status: widget.status,
            labels: widget.labels,
            onRetry: widget.onRetry,
          );
        }
        return widget.footer;
      },
    );

    if (widget.onRefresh != null) {
      list = AppRefreshIndicator(
        color: colors.gold,
        backgroundColor: colors.sheet,
        onRefresh: widget.onRefresh!,
        child: list,
      );
    }

    return NotificationListener<ScrollNotification>(
      onNotification: _onScroll,
      child: list,
    );
  }
}

/// The key of a row's collapsing ghost (never equal to a live row's key).
@immutable
class _GhostKey {
  const _GhostKey(this.of);

  final Object of;

  @override
  bool operator ==(Object other) => other is _GhostKey && other.of == of;

  @override
  int get hashCode => Object.hash(_GhostKey, of);
}
