import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Full-screen error that tells "offline" apart from a server error
/// (docs/01 §8.3), with Retry either way.
class CasesErrorView extends StatelessWidget {
  const CasesErrorView({
    required this.error,
    required this.t,
    required this.onRetry,
    super.key,
  });

  final Object error;
  final Translator t;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    if (isOfflineError(error)) {
      return AppOfflineState(
        title: t.t('offline.title'),
        message: t.t('offline.message'),
        action: AppButton(
          label: t.t('error.retry'),
          icon: Icons.refresh_rounded,
          variant: AppButtonVariant.secondary,
          height: AppSizes.touchTarget,
          onPressed: onRetry,
        ),
      );
    }
    return AppErrorState(
      message: errorText(t, error),
      retryLabel: t.t('error.retry'),
      onRetry: onRetry,
    );
  }
}

/// Skeleton list in the shape of the cards it stands in for.
class CasesListSkeleton extends StatelessWidget {
  const CasesListSkeleton({this.count = 4, super.key});

  final int count;

  @override
  Widget build(BuildContext context) => ListView.separated(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.lg,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        itemCount: count,
        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (_, __) => const AppContentCardSkeleton(),
      );
}

/// A cursor-paginated docs/04 list with its five states (.cursorrules):
/// skeleton, empty, error/offline + Retry, data with pull-to-refresh and
/// the pagination footer. Rows stagger in on the first screenful.
class PagedListBody<T> extends ConsumerWidget {
  const PagedListBody({
    required this.value,
    required this.t,
    required this.itemBuilder,
    required this.itemKey,
    required this.empty,
    required this.onRefresh,
    required this.onLoadMore,
    required this.onRetryMore,
    this.header,
    super.key,
  });

  final AsyncValue<PaginatedList<T>> value;
  final Translator t;
  final Widget Function(BuildContext context, T item, int index) itemBuilder;
  final Object Function(T item) itemKey;
  final Widget empty;
  final Future<void> Function() onRefresh;
  final VoidCallback onLoadMore;
  final VoidCallback onRetryMore;
  final Widget? header;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;

    Future<void> pull() async {
      try {
        await onRefresh();
      } on Object catch (error) {
        if (context.mounted) showAppSnackBar(context, errorText(t, error));
      }
    }

    final Widget body = switch (value) {
      AsyncData(:final value) when value.items.isEmpty && !value.hasMore =>
        RefreshIndicator(
          key: const ValueKey('empty'),
          color: colors.gold,
          backgroundColor: colors.surface,
          onRefresh: pull,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              if (header != null)
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.lg,
                    AppSpacing.screenSide,
                    0,
                  ),
                  sliver: SliverToBoxAdapter(child: header),
                ),
              // hasScrollBody: true — the empty state uses LayoutBuilder,
              // which cannot report intrinsic sizes.
              SliverFillRemaining(child: empty),
            ],
          ),
        ),
      AsyncData(:final value) => AppPaginatedListView<T>(
          key: const ValueKey('data'),
          items: value.items,
          itemKey: itemKey,
          status: value.loadMoreError != null
              ? AppPaginationStatus.error
              : value.isLoadingMore
                  ? AppPaginationStatus.loading
                  : value.hasMore
                      ? AppPaginationStatus.idle
                      : AppPaginationStatus.end,
          labels: AppPaginationLabels(
            loadingMore: t.t('pagination.loadingMore'),
            error: t.t('pagination.error'),
            retry: t.t('error.retry'),
            end: t.t('pagination.end'),
          ),
          onLoadMore: onLoadMore,
          onRetry: onRetryMore,
          onRefresh: pull,
          itemSpacing: AppSpacing.md,
          header: header == null
              ? null
              : Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: header,
                ),
          itemBuilder: (context, item, index) => AppEntrance(
            index: index < 8 ? index + 1 : 0,
            child: itemBuilder(context, item, index),
          ),
        ),
      AsyncError(:final error) => KeyedSubtree(
          key: const ValueKey('error'),
          child: CasesErrorView(error: error, t: t, onRetry: pull),
        ),
      _ => const CasesListSkeleton(key: ValueKey('loading')),
    };
    return AnimatedSwitcher(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      child: body,
    );
  }
}

/// Detail-screen body for a single FutureProvider value: skeleton,
/// error/offline + Retry, data.
class AsyncDetailBody<T> extends StatelessWidget {
  const AsyncDetailBody({
    required this.value,
    required this.t,
    required this.onRetry,
    required this.builder,
    super.key,
  });

  final AsyncValue<T> value;
  final Translator t;
  final VoidCallback onRetry;
  final Widget Function(T data) builder;

  @override
  Widget build(BuildContext context) {
    final Widget body = switch (value) {
      AsyncData(:final value) => KeyedSubtree(
          key: const ValueKey('data'),
          child: builder(value),
        ),
      AsyncError(:final error) => KeyedSubtree(
          key: const ValueKey('error'),
          child: CasesErrorView(error: error, t: t, onRetry: onRetry),
        ),
      _ => const DetailSkeleton(key: ValueKey('loading')),
    };
    return AnimatedSwitcher(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      child: body,
    );
  }
}

/// Skeleton of a case/bid detail: title lines, a card, text block.
class DetailSkeleton extends StatelessWidget {
  const DetailSkeleton({super.key});

  @override
  Widget build(BuildContext context) => ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpacing.screenSide),
        children: const [
          AppSkeleton(width: 120, height: AppSpacing.md),
          SizedBox(height: AppSpacing.md),
          AppSkeleton(height: AppSpacing.xl),
          SizedBox(height: AppSpacing.sm),
          AppSkeleton(width: 220, height: AppSpacing.xl),
          SizedBox(height: AppSpacing.xl),
          AppContentCardSkeleton(),
          SizedBox(height: AppSpacing.xl),
          AppSkeleton(height: AppSpacing.md),
          SizedBox(height: AppSpacing.sm),
          AppSkeleton(height: AppSpacing.md),
          SizedBox(height: AppSpacing.sm),
          AppSkeleton(width: 180, height: AppSpacing.md),
        ],
      );
}
