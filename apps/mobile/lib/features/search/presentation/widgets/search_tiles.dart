import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/compact_case_row.dart';
import 'package:lawbid/features/cases/presentation/widgets/my_case_row.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/posts_feed_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_cover.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-10-07 (bug 16, "no huge cards"): Search shows posts as the
/// profile's 3-column grid of squares (a tap opens them as a feed from
/// there) and cases as compact rows.
class SearchPostTile extends ConsumerWidget {
  const SearchPostTile({required this.post, this.feed, super.key});

  /// Owner 2026-10-07: the results this tile sits among — a tap opens
  /// them as a feed starting here (Instagram).
  final List<Post>? feed;

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final (title, _) = PostTextCover.titleAndRest(post);
    final kindLabel = t.t(
      post.isNews && ref.watch(newsEnabledProvider)
          ? 'post.kind.news'
          : 'search.kind.post',
    );
    void open() {
      final list = feed;
      final i = list?.indexWhere((p) => p.id == post.id) ?? -1;
      if (list == null || i < 0) {
        context.push(SocialRoutes.post(post.id));
        return;
      }
      PostsFeedScreen.open(context, posts: list, index: i, oneAuthor: false);
    }

    return PostGridTile(
      post: post,
      semanticLabel: '$kindLabel. $title. ${post.author.displayName}',
      onTap: open,
    );
  }
}

/// An attorney's search result case: a compact row.
class SearchCaseTile extends ConsumerWidget {
  const SearchCaseTile({required this.item, super.key});

  final FeedCase item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final c = item;
    final budget = '${CaseFormat.budget(t, f, c.budget)} · '
        '${c.primaryStateCode}';
    final excerpt = c.excerpt.isNotEmpty ? c.excerpt : c.description;
    final files = c.dossier.imagesCount + c.dossier.documentsCount;
    return CompactCaseRow(
      key: ValueKey('search-case-${c.id}'),
      title: c.title,
      description: excerpt,
      status: StatusPill(label: budget, tone: StatusTone.gold),
      coverUrl: c.photos.isNotEmpty ? c.photos.first.previewUrl : null,
      coverKey: c.coverKey,
      coverSeed: c.id,
      categoryCode: c.practice.artCode,
      practiceCode: c.practice.code,
      filesCount: files > 0 ? files : c.photosCount,
      bidsCount: c.bidsCount,
      semanticLabel: '${c.title}. $budget',
      onTap: () => context.push(AppRoutes.caseDetail(c.id)),
    );
  }
}

/// A client's own case (Search → "My cases"): opens the owner screen.
class SearchMyCaseTile extends StatelessWidget {
  const SearchMyCaseTile({required this.item, super.key});

  final CaseSummary item;

  @override
  Widget build(BuildContext context) => MyCaseRow(item: item);
}

/// Compact case rows: the list's padding and the gap between rows.
const kSearchRowsPadding = EdgeInsets.fromLTRB(
  AppSpacing.lg,
  AppSpacing.xs,
  AppSpacing.lg,
  AppSpacing.sm,
);
const double kSearchRowGap = AppSpacing.sm;

/// A paged list of Search results: posts as the profile's 3-column grid,
/// cases as compact rows ([rows]).
class PagedTileGrid<T> extends StatelessWidget {
  const PagedTileGrid({
    required this.value,
    required this.itemBuilder,
    required this.empty,
    required this.onLoadMore,
    required this.onRefresh,
    this.rows = false,
    this.header,
    super.key,
  });

  final AsyncValue<PaginatedList<T>> value;
  final Widget Function(T item) itemBuilder;
  final Widget empty;
  final VoidCallback onLoadMore;
  final Future<void> Function() onRefresh;
  final Widget? header;

  /// Compact rows instead of the square grid.
  final bool rows;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return switch (value) {
      AsyncData(:final value) when value.items.isEmpty && !value.hasMore =>
        empty,
      AsyncData(:final value) => RefreshIndicator(
          color: colors.gold,
          onRefresh: onRefresh,
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (n.metrics.extentAfter < 600 && value.canLoadMore) {
                onLoadMore();
              }
              return false;
            },
            child: CustomScrollView(
              slivers: [
                if (header != null) SliverToBoxAdapter(child: header),
                if (rows)
                  SliverPadding(
                    padding: kSearchRowsPadding,
                    sliver: SliverList.separated(
                      itemCount: value.items.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: kSearchRowGap),
                      itemBuilder: (context, i) => itemBuilder(value.items[i]),
                    ),
                  )
                else
                  SliverGrid.builder(
                    gridDelegate: kPostGridDelegate,
                    itemCount: value.items.length,
                    itemBuilder: (context, i) => itemBuilder(value.items[i]),
                  ),
                if (value.isLoadingMore)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.lg),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                  ),
              ],
            ),
          ),
        ),
      AsyncError() => Center(
          child: TextButton(
            onPressed: onRefresh,
            child: const AppIcon(AppIcons.refreshRounded),
          ),
        ),
      _ when rows => ListView.separated(
          padding: kSearchRowsPadding,
          itemCount: 5,
          separatorBuilder: (_, __) => const SizedBox(height: kSearchRowGap),
          itemBuilder: (_, __) =>
              const AppSkeleton(height: 86, borderRadius: AppRadii.card),
        ),
      _ => GridView.builder(
          gridDelegate: kPostGridDelegate,
          itemCount: 9,
          itemBuilder: (_, __) => const AppSkeleton(borderRadius: 0),
        ),
    };
  }
}

/// A practice topic / hashtag row that explains itself: our practice
/// photo, the practice name, "#tag · N posts".
class TopicRow extends StatelessWidget {
  const TopicRow({
    required this.tag,
    required this.title,
    required this.subtitle,
    this.categoryCode,
    super.key,
  });

  final String tag;
  final String title;
  final String subtitle;
  final String? categoryCode;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: '$title, $subtitle',
      excludeSemantics: true,
      child: AppPressable(
        onTap: () => context.push(SocialRoutes.tag(tag)),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(AppRadii.field),
                child: SizedBox.square(
                  dimension: 56,
                  child: categoryCode == null
                      ? ColoredBox(
                          color: colors.goldTint,
                          child: AppIcon(
                            AppIcons.tagRounded,
                            color: colors.goldDark,
                          ),
                        )
                      : PracticePhoto(categoryCode: categoryCode),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
              AppIcon(
                AppIcons.chevronRightRounded,
                color: colors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
