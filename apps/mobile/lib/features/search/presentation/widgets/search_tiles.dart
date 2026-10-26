import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/my_case_row.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/posts_feed_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_cover.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-10-07 (bug 16, "no huge cards"): Search shows posts as the
/// profile's 3-column grid of squares (a tap opens them as a feed from
/// there) and cases as compact rows.
class SearchPostTile extends ConsumerWidget {
  const SearchPostTile({
    required this.post,
    this.feed,
    this.onOpened,
    super.key,
  });

  /// Owner 2026-10-15: told when the tile opens (the search learns).
  final VoidCallback? onOpened;

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
      onOpened?.call();
      // Owner 2026-10-13: a video tile opens the Reels player.
      if (post.video != null) {
        ReelsScreen.open(context, from: post);
        return;
      }
      final list = feed;
      final i = list?.indexWhere((p) => p.id == post.id) ?? -1;
      if (list == null || i < 0) {
        context.push(SocialRoutes.post(post.id));
        return;
      }
      PostsFeedScreen.open(context, posts: list, index: i, oneAuthor: false);
    }

    // The posts a screen below this tile: posters and first video bytes are
    // warmed for them while this one is on screen.
    final all = feed;
    final at = all?.indexWhere((p) => p.id == post.id) ?? -1;
    return PostGridTile(
      post: post,
      semanticLabel: '$kindLabel. $title. ${post.author.displayName}',
      showPin: false,
      autoplay: true,
      index: at < 0 ? 0 : at,
      warmAhead: all == null || at < 0
          ? const []
          : all.skip(at + 1).take(kSearchWarmAhead).toList(),
      onTap: open,
    );
  }
}

/// How many posts below a tile get their poster (and video start) warmed:
/// about a screen of the 3-column grid.
const kSearchWarmAhead = 9;

/// An attorney's search result case (owner 2026-10-15, variant C): a slim
/// card — the practice header (colour of the practice, budget · state),
/// the title and one line of text, then the paperclip, comments, bids and
/// the time at the right. No client data. The glow sits top right.
class SearchCaseTile extends ConsumerWidget {
  const SearchCaseTile({required this.item, this.onOpened, super.key});

  final FeedCase item;

  /// Owner 2026-10-15: told when the tile opens (the search learns).
  final VoidCallback? onOpened;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final c = item;
    final accent = practiceAccent(
      c.practice.categoryCode,
      surface: practiceCardBase(colors),
    );
    final category = CaseFormat.practice(
      t,
      c.practice.categoryI18nKey ?? c.practice.i18nKey,
      c.practice.categoryNameEn ?? c.practice.nameEn,
    );
    final money = '${CaseFormat.budget(t, f, c.budget)} · '
        '${c.primaryStateCode}';
    final excerpt = (c.excerpt.isNotEmpty ? c.excerpt : c.description ?? '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    final files = c.dossier.imagesCount + c.dossier.documentsCount;
    Widget stat(IconData icon, int n) => Padding(
          padding: const EdgeInsetsDirectional.only(end: AppSpacing.md),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(icon, size: 16, color: colors.textSecondary),
              const SizedBox(width: 3),
              Text(
                SocialFormat.count(f, n),
                style: type.bodySmall.copyWith(
                  color: colors.textSecondary,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        );
    return Semantics(
      button: true,
      label: '${c.title}. $money',
      excludeSemantics: true,
      child: AppPressable(
        onTap: () {
          onOpened?.call();
          context.push(AppRoutes.caseDetail(c.id));
        },
        child: Container(
          key: ValueKey('search-case-${c.id}'),
          clipBehavior: Clip.hardEdge,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.border),
          ),
          child: Stack(
            children: [
              PositionedDirectional(
                end: -70,
                top: -70,
                child: IgnorePointer(
                  child: Container(
                    width: 200,
                    height: 200,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          accent.withValues(alpha: dark ? 0.26 : 0.2),
                          accent.withValues(alpha: 0),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ColoredBox(
                    color: accent.withValues(alpha: dark ? 0.16 : 0.12),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: 3,
                      ),
                      // The practice name takes up to 68% of the row, the
                      // budget the rest (it shrinks, never cuts the name).
                      child: LayoutBuilder(
                        builder: (context, box) => Row(
                          children: [
                            ConstrainedBox(
                              constraints: BoxConstraints(
                                maxWidth: box.maxWidth * 0.68,
                              ),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: accent,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  category,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.bodySmall.copyWith(
                                    color: onPracticeAccent(accent),
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: Align(
                                alignment: AlignmentDirectional.centerEnd,
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    money,
                                    maxLines: 1,
                                    style: type.bodySmall.copyWith(
                                      color: colors.text,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.md,
                      AppSpacing.xs,
                      AppSpacing.md,
                      2,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          c.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        if (excerpt.isNotEmpty)
                          Text(
                            excerpt,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall.copyWith(
                              color: colors.textSecondary,
                            ),
                          ),
                        Row(
                          children: [
                            stat(
                              AppIcons.attachFileRounded,
                              files > 0 ? files : c.photosCount,
                            ),
                            stat(
                              AppIcons.chatBubbleOutlineRounded,
                              c.commentCount,
                            ),
                            stat(AppIcons.gavelRounded, c.bidsCount),
                            Expanded(
                              child: Align(
                                alignment: AlignmentDirectional.centerEnd,
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(
                                    SocialFormat.ago(t, f, c.createdAt),
                                    maxLines: 1,
                                    style: type.caption.copyWith(
                                      color: colors.textSecondary,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
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
    this.gridDelegate = kSearchPostGridDelegate,
    super.key,
  });

  final SliverGridDelegate gridDelegate;

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
                    gridDelegate: gridDelegate,
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
/// A stable colour for a tag with no practice: one of the practice colours
/// picked by the tag's text.
String _tileCategory(String tag) {
  final codes = kPracticeArtAssets.where((c) => !c.contains('.')).toList()
    ..sort();
  var h = 0;
  for (final u in tag.codeUnits) {
    h = (h * 31 + u) & 0x7fffffff;
  }
  return codes[h % codes.length];
}

class TopicRow extends StatelessWidget {
  const TopicRow({
    required this.tag,
    required this.title,
    required this.subtitle,
    this.categoryCode,
    this.onOpened,
    super.key,
  });

  final String tag;
  final String title;
  final String subtitle;
  final String? categoryCode;

  /// Owner 2026-10-15: told when the row opens (the search learns).
  final VoidCallback? onOpened;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: '$title, $subtitle',
      excludeSemantics: true,
      child: AppPressable(
        onTap: () {
          onOpened?.call();
          context.push(SocialRoutes.tag(tag));
        },
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
                      // A topic with no practiced posts yet: a tile in a
                      // colour of the tag, with its first letter.
                      ? ColoredBox(
                          color: practiceAccent(
                            _tileCategory(tag),
                            surface: practiceCardBase(colors),
                          ),
                          child: Center(
                            child: Text(
                              tag.isEmpty ? '#' : tag[0].toUpperCase(),
                              style: type.titleMedium.copyWith(
                                color: onPracticeAccent(
                                  practiceAccent(
                                    _tileCategory(tag),
                                    surface: practiceCardBase(colors),
                                  ),
                                ),
                                fontWeight: FontWeight.w700,
                              ),
                            ),
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
