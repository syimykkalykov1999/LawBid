import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
    return PagedListBody<Post>(
      value: value,
      t: t,
      skeleton: const PostListSkeleton(),
      itemKey: (p) => p.id,
      itemBuilder: (context, p, _) => PostCard(post: p),
      // §2.3: "Пока в ленте пусто" + recommended attorneys to follow.
      empty: ListView(
        padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
        children: [
          SizedBox(
            height: 340,
            child: AppEmptyState(
              icon: Icons.dynamic_feed_rounded,
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
    final deleted = ref.watch(
        deletedPostsProvider.select((d) => d.contains(widget.postId)));
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
              icon: Icons.hide_source_rounded,
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
                          ..._commentSlivers(context, comments),
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

  List<Widget> _commentSlivers(
      BuildContext context, AsyncValue<PaginatedList<Comment>> value) {
    final t = ref.read(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final notifier = ref.read(commentsProvider(widget.postId).notifier);
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
                  key: ValueKey(c.id), comment: c, onReply: _reply);
            },
          ),
        ],
      AsyncError() => [
          SliverToBoxAdapter(
            child: Center(
              child: TextButton(
                onPressed: () =>
                    ref.invalidate(commentsProvider(widget.postId)),
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
    final key = (tag: widget.tag, sort: _sort);
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
                icon: Icons.tag_rounded,
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
    final AsyncValue<PaginatedList<AttorneyRow>> value;
    final PagedNotifierLike notifier;
    if (id == null) {
      value = ref.watch(myFollowingProvider);
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
      body: PagedListBody<AttorneyRow>(
        value: value,
        t: t,
        itemKey: (r) => r.id,
        itemBuilder: (context, r, _) => AttorneyTile(row: r),
        empty: AppEmptyState(
          icon: Icons.people_outline_rounded,
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
                  Icon(Icons.hide_source_rounded,
                      color: colors.textSecondary),
                  const SizedBox(width: AppSpacing.md),
                  Text(t.t('post.unavailable'),
                      style: type.body.copyWith(color: colors.textSecondary)),
                ],
              ),
            )
          : PostCard(post: s.post!),
      empty: AppEmptyState(
        icon: Icons.bookmark_border_rounded,
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
    super.key,
  });

  final String attorneyId;
  final String emptyTitle;
  final String emptyMessage;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final deleted = ref.watch(deletedPostsProvider);
    final value = ref.watch(attorneyPostsProvider(attorneyId));
    return value.when(
      skipLoadingOnReload: true,
      loading: () => GridView.count(
        crossAxisCount: 3,
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        mainAxisSpacing: 2,
        crossAxisSpacing: 2,
        children: List.generate(6, (_) => const AppSkeleton(borderRadius: 0)),
      ),
      error: (_, __) => Center(
        child: TextButton(
          onPressed: () => ref.invalidate(attorneyPostsProvider(attorneyId)),
          child: Text(t.t('error.retry')),
        ),
      ),
      data: (page) {
        final posts =
            page.items.where((p) => !deleted.contains(p.id)).toList();
        if (posts.isEmpty) {
          // The grid sits in the profile's scroll view: a bounded height.
          return SizedBox(
            height: 280,
            child: AppEmptyState(
              icon: Icons.article_outlined,
              title: emptyTitle,
              message: emptyMessage,
            ),
          );
        }
        return Column(
          children: [
            GridView.builder(
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
                    child: p.media.isEmpty
                        ? Container(
                            color: colors.goldTint,
                            padding: const EdgeInsets.all(AppSpacing.sm),
                            child: Text(
                              p.body,
                              maxLines: 5,
                              overflow: TextOverflow.ellipsis,
                              style: type.caption.copyWith(color: colors.text),
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
                                  child: Icon(Icons.collections_rounded,
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
                onPressed: () => ref
                    .read(attorneyPostsProvider(attorneyId).notifier)
                    .loadMore(),
                child: Text(t.t('pagination.loadingMore')),
              ),
          ],
        );
      },
    );
  }
}
