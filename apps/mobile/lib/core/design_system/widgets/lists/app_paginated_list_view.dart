import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/buttons/app_button.dart';
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
                        child: Icon(
                          Icons.error_outline_rounded,
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
                  icon: Icons.refresh_rounded,
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
          child: Row(
            children: [
              Expanded(child: _Hairline(color: colors.goldStroke)),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                child: Text(
                  labels.end,
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
              ),
              Expanded(child: _Hairline(color: colors.goldStroke, flip: true)),
            ],
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
  });

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

class _AppPaginatedListViewState<T> extends State<AppPaginatedListView<T>> {
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
  }

  @override
  void dispose() {
    _ownController?.dispose();
    super.dispose();
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
    // header? + items + pagination footer + extra footer?
    final count = offset + widget.items.length + 1 + (hasFooter ? 1 : 0);

    Widget list = ListView.builder(
      controller: _controller,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: widget.padding,
      itemCount: count,
      itemBuilder: (context, index) {
        if (hasHeader && index == 0) return widget.header;
        final itemIndex = index - offset;
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
        if (itemIndex == widget.items.length) {
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
      list = RefreshIndicator(
        color: colors.gold,
        backgroundColor: colors.surface,
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
