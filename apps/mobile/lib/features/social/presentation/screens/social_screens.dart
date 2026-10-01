import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/features/practice/practice_options.dart'
    as practice_options;
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart'
    show PracticePhoto;
import 'package:lawbid/features/practice/practice_options.dart' as practices;
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Post skeletons for list loading states.
class PostListSkeleton extends StatelessWidget {
  const PostListSkeleton({super.key});

  @override
  Widget build(BuildContext context) => ListView.separated(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.all(AppSpacing.screenSide),
        itemCount: 2,
        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (_, __) => const PostCardSkeleton(),
      );
}

/// Drops posts deleted in this session from a page.
AsyncValue<PaginatedList<Post>> _withoutDeleted(
  AsyncValue<PaginatedList<Post>> value,
  Set<String> deleted,
) {
  if (deleted.isEmpty) return value;
  return value.whenData((v) => v.without((p) => deleted.contains(p.id)));
}

/// docs/05 §2 the post stream (the client's whole Feed tab; the
/// attorney's "Лента" tab). Empty: "Пока в ленте пусто" + recommended
/// attorneys (§2.3); offline: the cached first page.
class PostsFeedView extends ConsumerWidget {
  const PostsFeedView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final value = _withoutDeleted(
        ref.watch(feedProvider), ref.watch(deletedPostsProvider));
    final notifier = ref.read(feedProvider.notifier);
    return LayoutBuilder(builder: (context, box) {
      final height = feedCardHeight(box.maxHeight);
      return PagedListBody<Post>(
        value: value,
        t: t,
        edgeToEdge: true,
        skeleton: const PostListSkeleton(),
        itemKey: (p) => p.id,
        itemBuilder: (context, p, _) => PostCard(post: p, feedHeight: height),
        // §2.3: "Пока в ленте пусто" + recommended attorneys to follow.
        empty: ListView(
          padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
          children: [
            SizedBox(
              height: 340,
              child: AppEmptyState(
                icon: AppIcons.dynamicFeedRounded,
                title: t.t('feed.empty.title'),
                message: t.t('feed.empty.message'),
              ),
            ),
            const SuggestedAttorneys(),
          ],
        ),
        onRefresh: notifier.refresh,
        onLoadMore: notifier.loadMore,
        onRetryMore: notifier.retryLoadMore,
      );
    });
  }
}

/// OQ-034: "All" topics with a state chosen — newest posts of attorneys
/// licensed in that state.
class LatestPostsView extends ConsumerWidget {
  const LatestPostsView({required this.stateCode, super.key});

  final String stateCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final notifier = ref.read(latestPostsProvider(stateCode).notifier);
    return LayoutBuilder(builder: (context, box) {
      final height = feedCardHeight(box.maxHeight);
      return PagedListBody<Post>(
        value: _withoutDeleted(ref.watch(latestPostsProvider(stateCode)),
            ref.watch(deletedPostsProvider)),
        t: t,
        edgeToEdge: true,
        skeleton: const PostListSkeleton(),
        itemKey: (p) => p.id,
        itemBuilder: (context, p, _) => PostCard(post: p, feedHeight: height),
        empty: AppEmptyState(
          icon: AppIcons.mapOutlined,
          message: t.t('feed.state.empty'),
        ),
        onRefresh: notifier.refresh,
        onLoadMore: notifier.loadMore,
        onRetryMore: notifier.retryLoadMore,
      );
    });
  }
}

/// Owner 2026-09-30: posts of a qualification and/or only News (the topic
/// slider, a practice chip on a card, the profile's News tab).
class FilteredPostsView extends ConsumerWidget {
  const FilteredPostsView({
    this.practice,
    this.stateCode,
    this.newsOnly = false,
    super.key,
  });

  final String? practice;
  final String? stateCode;
  final bool newsOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final key = (state: stateCode, practice: practice, news: newsOnly);
    final notifier = ref.read(filteredPostsProvider(key).notifier);
    return LayoutBuilder(builder: (context, box) {
      final height = feedCardHeight(box.maxHeight);
      return PagedListBody<Post>(
        value: _withoutDeleted(ref.watch(filteredPostsProvider(key)),
            ref.watch(deletedPostsProvider)),
        t: t,
        edgeToEdge: true,
        skeleton: const PostListSkeleton(),
        itemKey: (p) => p.id,
        itemBuilder: (context, p, _) => PostCard(post: p, feedHeight: height),
        empty: AppEmptyState(
          icon: newsOnly ? AppIcons.newspaperRounded : AppIcons.tagRounded,
          message: t.t(newsOnly ? 'feed.news.empty' : 'feed.practice.empty'),
        ),
        onRefresh: notifier.refresh,
        onLoadMore: notifier.loadMore,
        onRetryMore: notifier.retryLoadMore,
      );
    });
  }
}

/// A qualification's posts on their own screen (a practice chip's tap).
class PracticePostsScreen extends ConsumerWidget {
  const PracticePostsScreen({required this.practice, super.key});

  final String practice;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(practices.practiceLabel(ref, practice)),
      ),
      body: FilteredPostsView(practice: practice),
    );
  }
}

/// Owner 2026-09-30: the feed filtered by one topic (hashtag), newest
/// first — what a topic in the clients' slider shows.
class TopicPostsView extends ConsumerWidget {
  const TopicPostsView({required this.tag, this.stateCode, super.key});

  final String tag;

  /// OQ-034: only attorneys licensed in this state.
  final String? stateCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final key = (tag: tag, sort: TagSort.fresh, state: stateCode);
    final notifier = ref.read(tagPostsProvider(key).notifier);
    return LayoutBuilder(builder: (context, box) {
      final height = feedCardHeight(box.maxHeight);
      return PagedListBody<Post>(
        value: _withoutDeleted(
            ref.watch(tagPostsProvider(key)), ref.watch(deletedPostsProvider)),
        t: t,
        edgeToEdge: true,
        skeleton: const PostListSkeleton(),
        itemKey: (p) => p.id,
        itemBuilder: (context, p, _) => PostCard(post: p, feedHeight: height),
        empty: AppEmptyState(
          icon: AppIcons.tagRounded,
          message: t.t('tag.empty'),
        ),
        onRefresh: notifier.refresh,
        onLoadMore: notifier.loadMore,
        onRetryMore: notifier.retryLoadMore,
      );
    });
  }
}

/// docs/05 §3.5 post screen: the post, the disclaimer, comments with
/// replies and the composer.
class PostScreen extends ConsumerStatefulWidget {
  const PostScreen({required this.postId, super.key});

  final String postId;

  @override
  ConsumerState<PostScreen> createState() => _PostScreenState();
}

class _PostScreenState extends ConsumerState<PostScreen> {
  ReplyTarget? _replyTo;
  final _focus = FocusNode();

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  void _reply(ReplyTarget target) {
    setState(() => _replyTo = target);
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final post = ref.watch(postProvider(widget.postId));
    final deleted = ref
        .watch(deletedPostsProvider.select((d) => d.contains(widget.postId)));
    final comments = ref.watch(commentsProvider(widget.postId));
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => Navigator.of(context).maybePop()),
        title: Text(t.t('post.title')),
      ),
      body: deleted
          ? AppEmptyState(
              icon: AppIcons.hideSourceRounded,
              message: t.t('post.unavailable'),
            )
          : AsyncDetailBody<Post>(
              value: post,
              t: t,
              onRetry: () => ref.invalidate(postProvider(widget.postId)),
              builder: (p) => Column(
                children: [
                  Expanded(
                    child: RefreshIndicator(
                      color: colors.gold,
                      onRefresh: () async {
                        ref
                          ..invalidate(postProvider(widget.postId))
                          ..invalidate(commentsProvider(widget.postId));
                      },
                      child: CustomScrollView(
                        slivers: [
                          SliverPadding(
                            padding:
                                const EdgeInsets.all(AppSpacing.screenSide),
                            sliver: SliverToBoxAdapter(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  PostCard(post: p, inDetail: true),
                                  const SizedBox(height: AppSpacing.md),
                                  const PostDisclaimer(),
                                ],
                              ),
                            ),
                          ),
                          ...commentThreadSlivers(
                              context, ref, widget.postId, comments, _reply),
                        ],
                      ),
                    ),
                  ),
                  CommentComposer(
                    postId: widget.postId,
                    replyTo: _replyTo,
                    focusNode: _focus,
                    onClearReply: () => setState(() => _replyTo = null),
                  ),
                ],
              ),
            ),
    );
  }
}

/// Comments of a thread (a post, or a case — OQ-034) as slivers: empty
/// text, list with paging, retry, skeleton.
List<Widget> commentThreadSlivers(
  BuildContext context,
  WidgetRef ref,
  String threadId,
  AsyncValue<PaginatedList<Comment>> value,
  void Function(ReplyTarget) onReply,
) {
  final t = ref.read(translatorProvider);
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final type = Theme.of(context).extension<AppTypographyTokens>()!;
  final notifier = ref.read(commentsProvider(threadId).notifier);
  return switch (value) {
    AsyncData(:final value) when value.items.isEmpty => [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Text(
              t.t('comment.empty'),
              textAlign: TextAlign.center,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
          ),
        ),
      ],
    AsyncData(:final value) => [
        SliverList.builder(
          itemCount: value.items.length + 1,
          itemBuilder: (context, i) {
            if (i == value.items.length) {
              if (value.loadMoreError != null) {
                return TextButton(
                  onPressed: notifier.retryLoadMore,
                  child: Text(t.t('error.retry')),
                );
              }
              if (value.canLoadMore) {
                notifier.loadMore();
                return const Padding(
                  padding: EdgeInsets.all(AppSpacing.lg),
                  child: Center(
                    child: SizedBox.square(
                      dimension: AppSizes.footerSpinner,
                      child: CircularProgressIndicator(
                          strokeWidth: AppSizes.footerSpinnerStroke),
                    ),
                  ),
                );
              }
              return const SizedBox(height: AppSpacing.xl);
            }
            final c = value.items[i];
            return CommentTile(
                key: ValueKey(c.id), comment: c, onReply: onReply);
          },
        ),
      ],
    AsyncError() => [
        SliverToBoxAdapter(
          child: Center(
            child: TextButton(
              onPressed: () => ref.invalidate(commentsProvider(threadId)),
              child: Text(t.t('error.retry')),
            ),
          ),
        ),
      ],
    _ => [
        const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(AppSpacing.screenSide),
            child: Column(children: [
              AppSkeleton(height: 44),
              SizedBox(height: AppSpacing.md),
              AppSkeleton(height: 44),
            ]),
          ),
        ),
      ],
  };
}

/// docs/05 §7.5 topic page `#tag`: "Топ" and "Новые".
class TagScreen extends ConsumerStatefulWidget {
  const TagScreen({required this.tag, super.key});

  final String tag;

  @override
  ConsumerState<TagScreen> createState() => _TagScreenState();
}

class _TagScreenState extends ConsumerState<TagScreen> {
  TagSort _sort = TagSort.top;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    // Audit 2026-10-01: a qualification's topic shows every post of that
    // qualification (and its subcategories), not only the hashtagged ones.
    final category = categoryForTopicTag(widget.tag);
    if (category != null) {
      return Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
              semanticLabel: t.t('common.back'),
              onPressed: () => Navigator.of(context).maybePop()),
          title: Text(practice_options.practiceLabel(ref, category)),
        ),
        body: FilteredPostsView(
          key: ValueKey('topic-$category'),
          practice: category,
        ),
      );
    }
    final key = (tag: widget.tag, sort: _sort, state: null);
    final value = _withoutDeleted(
        ref.watch(tagPostsProvider(key)), ref.watch(deletedPostsProvider));
    final notifier = ref.read(tagPostsProvider(key).notifier);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => Navigator.of(context).maybePop()),
        title: Text('#${widget.tag}'),
      ),
      body: Column(
        children: [
          PillTabs<TagSort>(
            value: _sort,
            tabs: [
              (TagSort.top, t.t('tag.top')),
              (TagSort.fresh, t.t('tag.new')),
            ],
            onChanged: (v) => setState(() => _sort = v),
          ),
          Expanded(
            child: PagedListBody<Post>(
              key: ValueKey(_sort),
              value: value,
              t: t,
              skeleton: const PostListSkeleton(),
              itemKey: (p) => p.id,
              itemBuilder: (context, p, _) => PostCard(post: p),
              empty: AppEmptyState(
                icon: AppIcons.tagRounded,
                message: t.t('tag.empty'),
              ),
              onRefresh: notifier.refresh,
              onLoadMore: notifier.loadMore,
              onRetryMore: notifier.retryLoadMore,
            ),
          ),
        ],
      ),
    );
  }
}

/// docs/05 §6.2 followers / following of an attorney, or my follows.
class FollowListScreen extends ConsumerWidget {
  const FollowListScreen({
    required this.kind,
    this.attorneyId,
    super.key,
  });

  /// null = "Мои подписки" (`GET /users/me/following`).
  final String? attorneyId;
  final FollowListKind kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final id = attorneyId;
    final AsyncValue<PaginatedList<PersonRow>> value;
    final PagedNotifierLike notifier;
    if (id == null) {
      // My follows are attorneys only; shown through the same row type.
      value = ref.watch(myFollowingProvider).whenData(
            (l) => l.map(PersonRow.attorney),
          );
      final n = ref.read(myFollowingProvider.notifier);
      notifier = (n.refresh, n.loadMore, n.retryLoadMore);
    } else {
      final key = (attorneyId: id, kind: kind);
      value = ref.watch(followListProvider(key));
      final n = ref.read(followListProvider(key).notifier);
      notifier = (n.refresh, n.loadMore, n.retryLoadMore);
    }
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => Navigator.of(context).maybePop()),
        title: Text(t.t(kind == FollowListKind.followers
            ? 'follow.followers'
            : 'follow.followingList')),
      ),
      body: PagedListBody<PersonRow>(
        value: value,
        t: t,
        itemKey: (r) => r.id,
        itemBuilder: (context, r, _) => PersonTile(row: r),
        empty: AppEmptyState(
          icon: AppIcons.peopleOutlineRounded,
          message: t.t(kind == FollowListKind.followers
              ? 'follow.followers.empty'
              : 'follow.following.empty'),
        ),
        onRefresh: notifier.$1,
        onLoadMore: notifier.$2,
        onRetryMore: notifier.$3,
      ),
    );
  }
}

typedef PagedNotifierLike = (
  Future<void> Function(),
  VoidCallback,
  VoidCallback,
);

/// "Моё → Сохранённое" posts (docs/05 §4); a post deleted or hidden since
/// shows as "Пост недоступен".
class SavedPostsList extends ConsumerWidget {
  const SavedPostsList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(savedPostsProvider);
    final notifier = ref.read(savedPostsProvider.notifier);
    final overrides = ref.watch(postOverridesProvider);
    return PagedListBody<SavedPost>(
      value: value.whenData((v) => v.without(
          (s) => s.post != null && overrides[s.postId]?.savedByMe == false)),
      t: t,
      skeleton: const PostListSkeleton(),
      itemKey: (s) => s.postId,
      itemBuilder: (context, s, _) => s.post == null
          ? Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Row(
                children: [
                  AppIcon(AppIcons.hideSourceRounded, color: colors.textSecondary),
                  const SizedBox(width: AppSpacing.md),
                  Text(t.t('post.unavailable'),
                      style: type.body.copyWith(color: colors.textSecondary)),
                ],
              ),
            )
          : PostCard(post: s.post!),
      empty: AppEmptyState(
        icon: AppIcons.bookmarkBorderRounded,
        message: t.t('mine.savedPosts.empty'),
      ),
      onRefresh: notifier.refresh,
      onLoadMore: notifier.loadMore,
      onRetryMore: notifier.retryLoadMore,
    );
  }
}

/// docs/03 profile "Посты" tab: a 3-column grid; a text post is a tile
/// with the beginning of its text (docs/05 §2.4).
class ProfilePostsGrid extends ConsumerWidget {
  const ProfilePostsGrid({
    required this.attorneyId,
    required this.emptyTitle,
    required this.emptyMessage,
    this.newsOnly = false,
    super.key,
  });

  /// Owner 2026-09-30: the profile's News tab.
  final bool newsOnly;

  final String attorneyId;
  final String emptyTitle;
  final String emptyMessage;

  AsyncNotifierProvider<AttorneyPostsNotifier, PaginatedList<Post>>
      get _provider => newsOnly
          ? attorneyNewsProvider(attorneyId)
          : attorneyPostsProvider(attorneyId);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final deleted = ref.watch(deletedPostsProvider);
    final value = ref.watch(_provider);
    return value.when(
      skipLoadingOnReload: true,
      loading: () => GridView.count(
        // No inherited safe-area padding: the grid sits flush under the
        // tabs (owner 2026-10-01).
        padding: EdgeInsets.zero,
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 2,
        crossAxisSpacing: 2,
        children: List.generate(6, (_) => const AppSkeleton(borderRadius: 0)),
      ),
      error: (_, __) => Center(
        child: TextButton(
          onPressed: () => ref.invalidate(_provider),
          child: Text(t.t('error.retry')),
        ),
      ),
      data: (page) {
        final posts = page.items.where((p) => !deleted.contains(p.id)).toList();
        if (posts.isEmpty) {
          // The grid sits in the profile's scroll view: a bounded height.
          return SizedBox(
            height: 280,
            child: AppEmptyState(
              icon: AppIcons.articleOutlined,
              title: emptyTitle,
              message: emptyMessage,
            ),
          );
        }
        return Column(
          children: [
            GridView.builder(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 2,
                crossAxisSpacing: 2,
              ),
              itemCount: posts.length,
              itemBuilder: (context, i) {
                final p = posts[i];
                return Semantics(
                  button: true,
                  label: t.t('post.open'),
                  child: AppPressable(
                    onTap: () => context.push(SocialRoutes.post(p.id)),
                    child: p.media.isEmpty && p.practice != null
                        // Owner 2026-09-30: no photos — our art of the
                        // post's qualification under its title.
                        ? Stack(
                            fit: StackFit.expand,
                            children: [
                              PracticePhoto(
                                categoryCode: p.practice!.categoryCode,
                                practiceCode: p.practice!.code,
                              ),
                              const DecoratedBox(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    stops: [0.35, 1],
                                    colors: [
                                      Color(0x00000000),
                                      Color(0xCC0A1A3F),
                                    ],
                                  ),
                                ),
                              ),
                              Positioned(
                                left: 6,
                                right: 6,
                                bottom: 6,
                                child: Text(
                                  p.title ?? splitPostBody(p.body).$1,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.caption.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              if (p.isNews)
                                const Positioned(
                                  top: 6,
                                  right: 6,
                                  child: AppIcon(AppIcons.newspaperRounded,
                                      size: 16, color: Colors.white),
                                ),
                            ],
                          )
                        : p.media.isEmpty
                            ? Container(
                                color: colors.goldTint,
                                padding: const EdgeInsets.all(AppSpacing.sm),
                                child: Text(
                                  p.title ?? p.body,
                                  maxLines: 5,
                                  overflow: TextOverflow.ellipsis,
                                  style:
                                      type.caption.copyWith(color: colors.text),
                                ),
                              )
                            : Stack(
                                fit: StackFit.expand,
                                children: [
                                  CachedNetworkImage(
                                    imageUrl: p.media.first.previewUrl,
                                    cacheKey: '${p.media.first.fileId}:320',
                                    fit: BoxFit.cover,
                                    placeholder: (_, __) =>
                                        ColoredBox(color: colors.skeletonBase),
                                    errorWidget: (_, __, ___) =>
                                        ColoredBox(color: colors.skeletonBase),
                                  ),
                                  if (p.media.length > 1)
                                    const Positioned(
                                      top: 6,
                                      right: 6,
                                      child: AppIcon(AppIcons.collectionsRounded,
                                          size: 16, color: Colors.white),
                                    ),
                                ],
                              ),
                  ),
                );
              },
            ),
            if (page.canLoadMore)
              TextButton(
                onPressed: () => ref.read(_provider.notifier).loadMore(),
                child: Text(t.t('pagination.loadingMore')),
              ),
          ],
        );
      },
    );
  }
}
