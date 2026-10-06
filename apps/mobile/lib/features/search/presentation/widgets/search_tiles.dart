import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_cover.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-09-30: Search shows posts and cases as an Instagram-like
/// grid of tiles that still say what they are — the photo (the post's own
/// or our practice photo), a kind label ("Post"/"Case") with the practice,
/// the title, and the author / budget.
class SearchTileFrame extends StatelessWidget {
  const SearchTileFrame({
    required this.picture,
    required this.kindIcon,
    required this.kindLabel,
    required this.title,
    required this.footer,
    required this.onTap,
    required this.semanticLabel,
    super.key,
  });

  final Widget picture;
  final IconData kindIcon;
  final String kindLabel;
  final String title;
  final String footer;
  final VoidCallback onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.field),
          child: Stack(
            fit: StackFit.expand,
            children: [
              picture,
              // Legibility: dark from the bottom, light at the top.
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0x33000000),
                      Color(0x00000000),
                      Color(0xCC000000),
                    ],
                    stops: [0, 0.35, 1],
                  ),
                ),
              ),
              Positioned(
                left: AppSpacing.sm,
                top: AppSpacing.sm,
                right: AppSpacing.sm,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: colors.navy.withValues(alpha: 0.85),
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AppIcon(kindIcon, size: 13, color: colors.goldLight),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            kindLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              Positioned(
                left: AppSpacing.sm,
                right: AppSpacing.sm,
                bottom: AppSpacing.sm,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      footer,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: Colors.white.withValues(alpha: 0.85),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SearchPostTile extends ConsumerWidget {
  const SearchPostTile({required this.post, super.key});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final (title, _) = PostTextCover.titleAndRest(post);
    final practice = PostTextCover.practiceOf(ref, post);
    final kindLabel = t.t(
      post.isNews && ref.watch(newsEnabledProvider)
          ? 'post.kind.news'
          : 'search.kind.post',
    );
    final kind = [kindLabel, if (practice != null) practice.$1].join(' · ');
    void open() => context.push(SocialRoutes.post(post.id));
    final semantic = '$kind. $title. ${post.author.displayName}';
    final thumb = post.media.isNotEmpty
        ? (
            url: post.media.first.previewUrl,
            key: '${post.media.first.fileId}:320'
          )
        : post.video?.thumbnailUrl != null
            ? (url: post.video!.thumbnailUrl!, key: post.video!.thumbnailUrl!)
            : null;
    // Owner 2026-10-05: no photo or video frame — the text cover (title
    // first, practice chip only when chosen, the author at the bottom).
    Widget cover() => PostTextCover(post: post, kindLabel: kindLabel);
    if (thumb == null) {
      return Semantics(
        button: true,
        label: semantic,
        excludeSemantics: true,
        child: AppPressable(
          onTap: open,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.field),
            child: cover(),
          ),
        ),
      );
    }
    final image = CachedNetworkImage(
      imageUrl: thumb.url,
      cacheKey: thumb.key,
      fit: BoxFit.cover,
      errorWidget: (_, __, ___) => cover(),
    );
    return SearchTileFrame(
      picture: post.video == null
          ? image
          : Stack(
              fit: StackFit.expand,
              children: [
                image,
                const Center(
                  child: AppIcon(
                    AppIcons.playArrowRounded,
                    size: 40,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
      kindIcon: post.video != null
          ? AppIcons.playArrowRounded
          : AppIcons.articleRounded,
      kindLabel: kind,
      title: title,
      footer: post.author.displayName,
      semanticLabel: semantic,
      onTap: open,
    );
  }
}

class SearchCaseTile extends ConsumerWidget {
  const SearchCaseTile({required this.item, super.key});

  final FeedCase item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final practice = CaseFormat.practice(
      t,
      item.practice.categoryI18nKey ?? item.practice.i18nKey,
      item.practice.categoryNameEn ?? item.practice.nameEn,
    );
    final kind = '${t.t('search.kind.case')} · $practice';
    final footer =
        '${CaseFormat.budget(t, f, item.budget)} · ${item.primaryStateCode}';
    return SearchTileFrame(
      picture: PracticePhoto(
        categoryCode: item.practice.artCode,
        practiceCode: item.practice.code,
      ),
      kindIcon: AppIcons.workRounded,
      kindLabel: kind,
      title: item.title,
      footer: footer,
      semanticLabel: '$kind. ${item.title}. $footer',
      onTap: () => context.push(AppRoutes.caseDetail(item.id)),
    );
  }
}

/// A client's own case (Search → "My cases"): opens the owner screen.
class SearchMyCaseTile extends ConsumerWidget {
  const SearchMyCaseTile({required this.item, super.key});

  final CaseSummary item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final practice = CaseFormat.practice(
      t,
      item.practice.categoryI18nKey ?? item.practice.i18nKey,
      item.practice.categoryNameEn ?? item.practice.nameEn,
    );
    final kind = '${t.t('search.kind.case')} · $practice';
    final footer = '${CaseFormat.budget(t, f, item.budget)} · '
        '${t.t('cases.card.bidsCount', {
          'count': SocialFormat.count(f, item.bidsCount),
        })}';
    return SearchTileFrame(
      picture: PracticePhoto(
        categoryCode: item.practice.artCode,
        practiceCode: item.practice.code,
      ),
      kindIcon: AppIcons.folderRounded,
      kindLabel: kind,
      title: item.title,
      footer: footer,
      semanticLabel: '$kind. ${item.title}. $footer',
      onTap: () => context.push(AppRoutes.myCase(item.id)),
    );
  }
}

/// Two tiles per row; a tile a bit taller than wide so three lines of
/// title fit.
const kSearchGridDelegate = SliverGridDelegateWithFixedCrossAxisCount(
  crossAxisCount: 2,
  mainAxisSpacing: AppSpacing.sm,
  crossAxisSpacing: AppSpacing.sm,
  childAspectRatio: 0.8,
);

/// A paged grid of tiles (Search results).
class PagedTileGrid<T> extends StatelessWidget {
  const PagedTileGrid({
    required this.value,
    required this.itemBuilder,
    required this.empty,
    required this.onLoadMore,
    required this.onRefresh,
    this.header,
    super.key,
  });

  final AsyncValue<PaginatedList<T>> value;
  final Widget Function(T item) itemBuilder;
  final Widget empty;
  final VoidCallback onLoadMore;
  final Future<void> Function() onRefresh;
  final Widget? header;

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
                SliverPadding(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  sliver: SliverGrid.builder(
                    gridDelegate: kSearchGridDelegate,
                    itemCount: value.items.length,
                    itemBuilder: (context, i) => itemBuilder(value.items[i]),
                  ),
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
      _ => GridView.builder(
          padding: const EdgeInsets.all(AppSpacing.sm),
          gridDelegate: kSearchGridDelegate,
          itemCount: 6,
          itemBuilder: (_, __) => const AppSkeleton(height: double.infinity),
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
