import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/presentation/widgets/feed_chrome.dart';
import 'package:lawbid/features/legal_qa/presentation/qa_banners.dart';
import 'package:lawbid/features/practice/practice_options.dart'
    as practice_options;
import 'package:lawbid/features/practice/practice_options.dart' as practices;
import 'package:lawbid/features/profile/presentation/widgets/profile_tab_pages.dart'
    show SliverMinExtent;
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/social/application/merged_paging.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/posts_feed_screen.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:lawbid/features/social/presentation/widgets/fresh_posts_pill.dart';
import 'package:lawbid/features/social/presentation/widgets/pending_post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_grid_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_impression_tracker.dart';
import 'package:lawbid/features/social/presentation/widgets/post_prefetch.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/presentation/guest_gate.dart';
import 'package:lawbid/shared/presentation/list_search_field.dart';

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
      ref.watch(feedProvider),
      ref.watch(deletedPostsProvider),
    );
    final notifier = ref.read(feedProvider.notifier);
    return LayoutBuilder(
      builder: (context, box) {
        final height =
            feedChromeCardHeight(context) ?? feedCardHeight(box.maxHeight);
        // Owner 2026-10-19 (Instagram): new posts wait in the «New posts»
        // pill on top; the list never jumps.
        return FreshPostsOverlay(
          child: PagedListBody<Post>(
            value: value,
            t: t,
            edgeToEdge: true,
            skeleton: const PostListSkeleton(),
            itemKey: (p) => p.id,
            prefetch: prefetchPost,
            itemBuilder: (context, p, i) => withQaBanner(
              i,
              value.value?.items.length ?? 0,
              PostImpressionTracker(
                post: p,
                child: PostCard(post: p, feedHeight: height),
              ),
            ),
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
          ),
        );
      },
    );
  }
}

/// OQ-034: "All" topics with a state chosen — newest posts of attorneys
/// licensed in that state (owner 2026-10-06: or in any of several states).
class LatestPostsView extends ConsumerWidget {
  const LatestPostsView({required this.stateCode, super.key});

  /// One state code, or several comma-separated ("IL,NY").
  final String stateCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final notifier = ref.read(latestPostsProvider(stateCode).notifier);
    return LayoutBuilder(
      builder: (context, box) {
        final height =
            feedChromeCardHeight(context) ?? feedCardHeight(box.maxHeight);
        final posts = _withoutDeleted(
          ref.watch(latestPostsProvider(stateCode)),
          ref.watch(deletedPostsProvider),
        );
        return PagedListBody<Post>(
          value: posts,
          t: t,
          edgeToEdge: true,
          skeleton: const PostListSkeleton(),
          itemKey: (p) => p.id,
          prefetch: prefetchPost,
          itemBuilder: (context, p, i) => withQaBanner(
            i,
            posts.value?.items.length ?? 0,
            PostImpressionTracker(
              post: p,
              child: PostCard(post: p, feedHeight: height),
            ),
          ),
          empty: AppEmptyState(
            icon: AppIcons.mapOutlined,
            message: t.t('feed.state.empty'),
          ),
          onRefresh: notifier.refresh,
          onLoadMore: notifier.loadMore,
          onRetryMore: notifier.retryLoadMore,
        );
      },
    );
  }
}

/// Owner 2026-09-30: posts of a qualification and/or only News (the topic
/// slider, a practice chip on a card, the profile's News tab).
class FilteredPostsView extends ConsumerWidget {
  const FilteredPostsView({
    this.practice,
    this.practices,
    this.stateCode,
    this.newsOnly = false,
    this.generalOnly = false,
    super.key,
  });

  final String? practice;

  /// Owner 2026-10-06: «Юр. посты» → «Только мои темы» — posts of any of
  /// these qualifications.
  final List<String>? practices;

  /// One state code, or several comma-separated ("IL,NY").
  final String? stateCode;
  final bool newsOnly;

  /// Owner 2026-10-05: the "Posts" topic — general (personal) posts.
  final bool generalOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final key = (
      state: stateCode,
      practice: practice,
      news: newsOnly,
      general: generalOnly,
      practices: practices?.join(','),
    );
    final notifier = ref.read(filteredPostsProvider(key).notifier);
    return LayoutBuilder(
      builder: (context, box) {
        final height =
            feedChromeCardHeight(context) ?? feedCardHeight(box.maxHeight);
        final posts = _withoutDeleted(
          ref.watch(filteredPostsProvider(key)),
          ref.watch(deletedPostsProvider),
        );
        return PagedListBody<Post>(
          value: posts,
          t: t,
          edgeToEdge: true,
          skeleton: const PostListSkeleton(),
          itemKey: (p) => p.id,
          prefetch: prefetchPost,
          itemBuilder: (context, p, i) => withQaBanner(
            i,
            posts.value?.items.length ?? 0,
            PostImpressionTracker(
              post: p,
              child: PostCard(post: p, feedHeight: height),
            ),
          ),
          empty: AppEmptyState(
            icon: newsOnly ? AppIcons.newspaperRounded : AppIcons.tagRounded,
            message: t.t(
              newsOnly
                  ? 'feed.news.empty'
                  : generalOnly
                      ? 'feed.posts.empty'
                      : 'feed.practice.empty',
            ),
          ),
          onRefresh: notifier.refresh,
          onLoadMore: notifier.loadMore,
          onRetryMore: notifier.retryLoadMore,
        );
      },
    );
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

/// docs/05 §3.5 post screen: the post, the disclaimer, comments with
/// replies and the composer.
class PostScreen extends ConsumerWidget {
  const PostScreen({required this.postId, this.fromProfile = false, super.key});

  final String postId;

  /// Opened from someone's grid: no author row (owner 2026-10-07).
  final bool fromProfile;

  void _leave(BuildContext context) {
    // A deep link opens this with go(): nothing to pop → back to the feed.
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AppRoutes.feed);
    }
  }

  /// Owner 2026-10-07 (Instagram): the open post is full screen and
  /// spacious — photos edge to edge, the whole text, the actions; the
  /// comments open as a sheet from the comment button, and the big
  /// promote card became the small «Продвигать» button under the post.
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final post = ref.watch(postProvider(postId));
    final deleted =
        ref.watch(deletedPostsProvider.select((d) => d.contains(postId)));
    // Owner 2026-10-15: no inner card with tabs — the post opens as a plain
    // page (a link, a notification) with the same card as in the feed.
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => _leave(context),
        ),
      ),
      body: deleted
          ? AppEmptyState(
              icon: AppIcons.hideSourceRounded,
              message: t.t('post.unavailable'),
            )
          : AsyncDetailBody<Post>(
              value: post,
              t: t,
              onRetry: () => ref.invalidate(postProvider(postId)),
              builder: (p) => PostCard.isThreadsStyle(p)
                  ? _ThreadDetail(post: p, fromProfile: fromProfile)
                  : RefreshIndicator(
                      color: colors.gold,
                      onRefresh: () async =>
                          ref.invalidate(postProvider(postId)),
                      child: ListView(
                        padding: EdgeInsets.only(
                          bottom: MediaQuery.paddingOf(context).bottom +
                              AppSpacing.xl,
                        ),
                        children: [
                          PostImpressionTracker(
                            post: p,
                            child: PostCard(
                              post: p,
                              inDetail: true,
                              fromProfile: fromProfile,
                            ),
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(
                              horizontal: AppSpacing.screenSide,
                            ),
                            child: PostDisclaimer(),
                          ),
                        ],
                      ),
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
  void Function(ReplyTarget) onReply, {
  bool threads = false,
}) {
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
                // Audit C18: not while the list is being built.
                WidgetsBinding.instance
                    .addPostFrameCallback((_) => notifier.loadMore());
                return const Padding(
                  padding: EdgeInsets.all(AppSpacing.lg),
                  child: Center(
                    child: SizedBox.square(
                      dimension: AppSizes.footerSpinner,
                      child: CircularProgressIndicator(
                        strokeWidth: AppSizes.footerSpinnerStroke,
                      ),
                    ),
                  ),
                );
              }
              return const SizedBox(height: AppSpacing.xl);
            }
            final c = value.items[i];
            return CommentTile(
              key: ValueKey(c.id),
              comment: c,
              threads: threads,
              onReply: onReply,
            );
          },
        ),
      ],
    AsyncError(:final error) when error is ApiException && error.guest => [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xl),
            child: Column(
              children: [
                Text(
                  t.t('guest.error.signIn'),
                  textAlign: TextAlign.center,
                  style: type.body.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  key: const ValueKey('guest-comments-sign-in'),
                  label: t.t('guest.signIn'),
                  height: AppSizes.touchTarget,
                  onPressed: () => openSignIn(context, ref),
                ),
              ],
            ),
          ),
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
            child: Column(
              children: [
                AppSkeleton(height: 44),
                SizedBox(height: AppSpacing.md),
                AppSkeleton(height: 44),
              ],
            ),
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
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          title: Text(practice_options.practiceLabel(ref, category)),
        ),
        body: FilteredPostsView(
          key: ValueKey('topic-$category'),
          practice: category,
        ),
      );
    }
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text('#${widget.tag}'),
      ),
      body: Column(
        children: [
          PillTabs<TagSort>(
            value: _sort,
            tabs: [
              (TagSort.top, t.t('tag.top')),
              (TagSort.fresh, t.t('tag.new')),
              (TagSort.video, t.t('tag.video')),
            ],
            onChanged: (v) => setState(() => _sort = v),
          ),
          // Owner 2026-10-19: the sections slide with the finger and on a
          // tap (Instagram); each keeps its list and scroll once built.
          Expanded(
            child: SwipePages<TagSort>(
              value: _sort,
              values: const [TagSort.top, TagSort.fresh, TagSort.video],
              onChanged: (v) => setState(() => _sort = v),
              pageBuilder: (_, sort) => _TagSortPage(
                key: ValueKey(sort),
                tag: widget.tag,
                sort: sort,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One section of [TagScreen] (Top, New or Video).
class _TagSortPage extends ConsumerWidget {
  const _TagSortPage({required this.tag, required this.sort, super.key});

  final String tag;
  final TagSort sort;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final key = (tag: tag, sort: sort, state: null);
    final value = _withoutDeleted(
      ref.watch(tagPostsProvider(key)),
      ref.watch(deletedPostsProvider),
    );
    final notifier = ref.read(tagPostsProvider(key).notifier);
    return PagedListBody<Post>(
      value: value,
      t: t,
      skeleton: const PostListSkeleton(),
      itemKey: (p) => p.id,
      itemBuilder: (context, p, _) => PostImpressionTracker(
        post: p,
        child: PostCard(post: p),
      ),
      empty: AppEmptyState(
        icon: AppIcons.tagRounded,
        message: t.t('tag.empty'),
      ),
      onRefresh: notifier.refresh,
      onLoadMore: notifier.loadMore,
      onRetryMore: notifier.retryLoadMore,
    );
  }
}

/// docs/05 §6.2 followers / following of a person. Owner 2026-10-18: a
/// search box above the list (name in any alphabet, @username) — the server
/// matches.
class FollowListScreen extends ConsumerStatefulWidget {
  const FollowListScreen({
    required this.kind,
    required this.attorneyId,
    super.key,
  });

  final String attorneyId;
  final FollowListKind kind;

  @override
  ConsumerState<FollowListScreen> createState() => _FollowListScreenState();
}

class _FollowListScreenState extends ConsumerState<FollowListScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final kind = widget.kind;
    final key = (attorneyId: widget.attorneyId, kind: kind, q: _q);
    final value = ref.watch(followListProvider(key));
    final n = ref.read(followListProvider(key).notifier);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(
          t.t(
            kind == FollowListKind.followers
                ? 'follow.followers'
                : 'follow.followingList',
          ),
        ),
      ),
      body: Column(
        children: [
          ListSearchField(
            fieldKey: const ValueKey('follow-search'),
            hintKey: 'follow.search.hint',
            onChanged: (q) => setState(() => _q = q),
          ),
          Expanded(
            child: PagedListBody<PersonRow>(
              value: value,
              t: t,
              itemKey: (r) => r.id,
              itemBuilder: (context, r, _) => PersonTile(row: r),
              empty: _q.isNotEmpty
                  ? AppEmptyState(
                      icon: AppIcons.searchRounded,
                      title: t.t('follow.search.empty.title'),
                      message: t.t('follow.search.empty.hint'),
                    )
                  : AppEmptyState(
                      icon: AppIcons.peopleOutlineRounded,
                      message: t.t(
                        kind == FollowListKind.followers
                            ? 'follow.followers.empty'
                            : 'follow.following.empty',
                      ),
                    ),
              onRefresh: n.refresh,
              onLoadMore: n.loadMore,
              onRetryMore: n.retryLoadMore,
            ),
          ),
        ],
      ),
    );
  }
}

/// Owner 2026-10-20: people who liked a post (avatar, name, follow).
class LikersScreen extends ConsumerWidget {
  const LikersScreen({required this.postId, super.key});

  final String postId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(postLikersProvider(postId));
    final n = ref.read(postLikersProvider(postId).notifier);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('post.stats.likes')),
      ),
      body: PagedListBody<PersonRow>(
        value: value,
        t: t,
        itemKey: (r) => r.id,
        itemBuilder: (context, r, _) => PersonTile(row: r),
        empty: AppEmptyState(
          icon: AppIcons.favoriteRounded,
          message: t.t('post.likers.empty'),
        ),
        onRefresh: n.refresh,
        onLoadMore: n.loadMore,
        onRetryMore: n.retryLoadMore,
      ),
    );
  }
}

/// Owner 2026-10-18: people who reposted a post (avatar, name, follow).
class RepostersScreen extends ConsumerWidget {
  const RepostersScreen({required this.postId, super.key});

  final String postId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(postRepostersProvider(postId));
    final n = ref.read(postRepostersProvider(postId).notifier);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('post.reposters.title')),
      ),
      body: PagedListBody<PersonRow>(
        value: value,
        t: t,
        itemKey: (r) => r.id,
        itemBuilder: (context, r, _) => PersonTile(row: r),
        empty: AppEmptyState(
          icon: AppIcons.autoModeRounded,
          message: t.t('post.reposters.empty'),
        ),
        onRefresh: n.refresh,
        onLoadMore: n.loadMore,
        onRetryMore: n.retryLoadMore,
      ),
    );
  }
}

/// Owner 2026-10-18: the attorney profile's «Брифы и репосты» tab — their
/// briefs (text posts, as in the old «Текст» tab: pinned ones first, with
/// the pin) and their reposts (each with its «↻ … репост» header) in one list,
/// newest first: a brief by its publish time, a repost by its repost time.
/// Both sources page on their own; [mergeNewestFirst] only shows what no
/// unloaded page could precede, so «ещё» never skips or repeats a card.
class ProfileBriefsAndReposts extends ConsumerWidget {
  const ProfileBriefsAndReposts({
    required this.attorneyId,
    required this.isSelf,
    this.emptyOtherKey = 'profile.briefsReposts.empty.other',
    super.key,
  });

  final String attorneyId;
  final bool isSelf;

  /// Owner 2026-10-18: a client's profile has the same tab; its empty
  /// text names a user, not an attorney.
  final String emptyOtherKey;

  static const _briefs = 0;
  static const _reposts = 1;

  /// A repost's time: the API's repost time when it sends one; otherwise
  /// the post's own time, never newer than the repost above it (a repost
  /// always comes after the post was published, and the list is newest
  /// repost first).
  static List<DateTime> repostTimes(List<Post> reposts) => monotoneTimes(
        reposts,
        exact: (p) => p.repostedBy?.repostedAt,
        estimate: (p) => p.createdAt,
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final deleted = ref.watch(deletedPostsProvider);
    final overrides = ref.watch(postOverridesProvider);
    final postsValue = ref.watch(attorneyPostsProvider(attorneyId));
    final repostsValue = ref.watch(userRepostsProvider(attorneyId));
    final posts = postsValue.value;
    final reposts = repostsValue.value;

    if (posts == null || reposts == null) {
      final failed = (posts == null && postsValue.hasError) ||
          (reposts == null && repostsValue.hasError);
      if (failed && !postsValue.isLoading && !repostsValue.isLoading) {
        return Center(
          child: TextButton(
            onPressed: () {
              if (posts == null) {
                ref.invalidate(attorneyPostsProvider(attorneyId));
              }
              if (reposts == null) {
                ref.invalidate(userRepostsProvider(attorneyId));
              }
            },
            child: Text(t.t('error.retry')),
          ),
        );
      }
      return Column(
        children: List.generate(
          2,
          (_) => const Padding(
            padding: EdgeInsets.all(AppSpacing.lg),
            child: AppSkeleton(height: 96, borderRadius: AppRadii.card),
          ),
        ),
      );
    }

    // Pinned posts lead the API's first page out of date order; pinned
    // briefs stay on top here too.
    final dated = [
      for (final p in posts.items)
        if (p.pinSlot == null) p,
    ];
    final pinned = [
      for (final p in posts.items)
        if (p.pinSlot != null && PostCard.isThreadsStyle(p)) p,
    ];
    final times = repostTimes(reposts.items);
    final merged = mergeNewestFirst<Post>(
      [
        MergeSource(
          items: [
            for (final p in dated)
              if (PostCard.isThreadsStyle(p)) (p, p.createdAt),
          ],
          hasMore: posts.hasMore,
          boundary: dated.isEmpty ? null : dated.last.createdAt,
        ),
        MergeSource(
          items: [
            for (var i = 0; i < reposts.items.length; i++)
              (reposts.items[i], times[i]),
          ],
          hasMore: reposts.hasMore,
          boundary: times.isEmpty ? null : times.last,
        ),
      ],
      idOf: (p) => p.id,
    );

    bool visible(Post p, int source) =>
        !deleted.contains(p.id) &&
        // Undone from here (or from the post's own ↻): gone at once.
        !(source == _reposts &&
            isSelf &&
            overrides[p.id]?.repostedByMe == false);
    final pinnedShown = [
      for (final p in pinned)
        if (visible(p, _briefs)) p,
    ];
    final shown = [
      for (final e in merged.entries)
        if (!pinned.any((p) => p.id == e.item.id) && visible(e.item, e.source))
          e,
    ];

    if (pinnedShown.isEmpty && shown.isEmpty && !merged.hasMore) {
      return SizedBox(
        height: 280,
        child: AppEmptyState(
          icon: AppIcons.autoModeRounded,
          title: t.t('profile.briefsReposts.empty.title'),
          message: t.t(
            isSelf ? 'profile.briefsReposts.empty.self' : emptyOtherKey,
          ),
        ),
      );
    }

    void loadMore() {
      final next = merged.nextSource;
      if (next == null) return;
      if (next == _briefs) {
        final n = ref.read(attorneyPostsProvider(attorneyId).notifier);
        posts.loadMoreError != null ? n.retryLoadMore() : n.loadMore();
      } else {
        final n = ref.read(userRepostsProvider(attorneyId).notifier);
        reposts.loadMoreError != null ? n.retryLoadMore() : n.loadMore();
      }
    }

    final ownProfile = ref.watch(currentUserIdProvider) == attorneyId;
    // Owner 2026-10-28: the tab is the same full-width 3-column grid as
    // «Посты» (the same tiles: a video is only its cover, a text brief its
    // text cover); a tap opens the items as a feed from that tile.
    final tiles = <Post>[
      ...pinnedShown,
      for (final e in shown) e.item,
    ];
    return Column(
      children: [
        // Owner 2026-10-23: the posts being published lead the own profile.
        if (ownProfile) const PendingPostsStrip(),
        GridView.builder(
          key: const ValueKey('profile-reposts-grid'),
          padding: EdgeInsets.zero,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: profileGridDelegate(),
          itemCount: tiles.length,
          itemBuilder: (context, i) {
            final p = tiles[i];
            return PostGridTile(
              key: ValueKey('repost-tile-${p.id}'),
              post: p,
              semanticLabel: t.t('post.open'),
              onTap: () => PostsFeedScreen.open(
                context,
                posts: tiles,
                index: i,
                subtitle: p.author.username,
              ),
            );
          },
        ),
        if (merged.hasMore)
          TextButton(
            key: const ValueKey('briefs-reposts-more'),
            onPressed: loadMore,
            child: Text(t.t('pagination.loadingMore')),
          ),
      ],
    );
  }
}

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
      value: value.whenData(
        (v) => v.without(
          (s) => s.post != null && overrides[s.postId]?.savedByMe == false,
        ),
      ),
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
                  AppIcon(
                    AppIcons.hideSourceRounded,
                    color: colors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      t.t('post.unavailable'),
                      style: type.body.copyWith(color: colors.textSecondary),
                    ),
                  ),
                ],
              ),
            )
          : PostImpressionTracker(
              post: s.post!,
              child: PostCard(post: s.post!),
            ),
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
    this.threadsOnly = false,
    this.reelsOnly = false,
    this.asSliver = false,
    this.minExtent = 0,
    super.key,
  });

  /// 2026-10-26 (smoothness P4): build a sliver for a page of
  /// `ProfileSliverPage` — the post / reel grid is then a lazy `SliverGrid`
  /// in the profile's own scroll view instead of a `shrinkWrap` grid that
  /// builds every tile at once. Same geometry: the other states are the
  /// same boxes, held to [minExtent] like the box page's `ConstrainedBox`.
  final bool asSliver;

  /// The page's minimum height in [asSliver] mode.
  final double minExtent;

  /// Owner 2026-09-30: the profile's News tab.
  final bool newsOnly;

  /// Owner 2026-10-18: the profile's «Рилсы» tab — video posts / reels as
  /// vertical 9:16 tiles with their view count; a tap opens the reels
  /// player at that reel. The «Посты» grid (neither flag) keeps the photo
  /// and file posts only.
  final bool reelsOnly;

  /// Owner 2026-10-12 (Threads): the profile's threads tab — text posts as
  /// cards in a list; the grid tab keeps the posts with a photo or video.
  final bool threadsOnly;

  final String attorneyId;
  final String emptyTitle;
  final String emptyMessage;

  AsyncNotifierProvider<AttorneyPostsNotifier, PaginatedList<Post>>
      get _provider => newsOnly
          ? attorneyNewsProvider(attorneyId)
          : reelsOnly
              ? attorneyReelsProvider(attorneyId)
              : threadsOnly
                  ? attorneyPostsProvider(attorneyId)
                  : attorneyPhotoPostsProvider(attorneyId);

  /// What the tab shows; the server already filters by media, this keeps a
  /// post edited since (or an old server's page) in its own tab.
  bool _keeps(Post p) {
    if (newsOnly) return true;
    if (reelsOnly) return p.video != null;
    if (threadsOnly) return PostCard.isThreadsStyle(p);
    return !PostCard.isThreadsStyle(p) && p.video == null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final deleted = ref.watch(deletedPostsProvider);
    final value = ref.watch(_provider);
    // In sliver mode every box state is the same box the box page had
    // (held to the page's minimum height), only inside a sliver.
    Widget boxed(Widget child) => asSliver
        ? SliverToBoxAdapter(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: minExtent),
              child: child,
            ),
          )
        : child;
    // The grid with its «load more» button: a Column of a shrink-wrapped
    // grid as a box, a lazy SliverGrid in sliver mode (same layout: the
    // grid at the top, the button centred under it).
    Widget gridWithMore(
      PaginatedList<Post> page, {
      required SliverGridDelegate delegate,
      required int count,
      required IndexedWidgetBuilder tile,
      Key? gridKey,
    }) {
      final more = page.canLoadMore
          ? TextButton(
              onPressed: () => ref.read(_provider.notifier).loadMore(),
              child: Text(t.t('pagination.loadingMore')),
            )
          : null;
      if (asSliver) {
        return SliverMinExtent(
          minExtent: minExtent,
          sliver: SliverMainAxisGroup(
            slivers: [
              SliverGrid(
                key: gridKey,
                gridDelegate: delegate,
                delegate: SliverChildBuilderDelegate(tile, childCount: count),
              ),
              if (more != null) SliverToBoxAdapter(child: Center(child: more)),
            ],
          ),
        );
      }
      return Column(
        children: [
          GridView.builder(
            key: gridKey,
            padding: EdgeInsets.zero,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: delegate,
            itemCount: count,
            itemBuilder: tile,
          ),
          if (more != null) more,
        ],
      );
    }

    return value.when(
      skipLoadingOnReload: true,
      // Six placeholder tiles: short, stays a shrink-wrapped grid.
      loading: () => boxed(
        GridView.count(
          // No inherited safe-area padding: the grid sits flush under the
          // tabs (owner 2026-10-01).
          padding: EdgeInsets.zero,
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 2,
          crossAxisSpacing: 2,
          children:
              List.generate(6, (_) => const AppSkeleton(borderRadius: 0)),
        ),
      ),
      error: (_, __) => boxed(
        Center(
          child: TextButton(
            onPressed: () => ref.invalidate(_provider),
            child: Text(t.t('error.retry')),
          ),
        ),
      ),
      data: (page) {
        final posts = page.items
            .where(
              (p) => !deleted.contains(p.id) && _keeps(p),
            )
            .toList();
        if (posts.isEmpty) {
          // The grid sits in the profile's scroll view: a bounded height.
          return boxed(
            SizedBox(
              height: 280,
              child: AppEmptyState(
                icon: reelsOnly
                    ? AppIcons.playCircleOutlined
                    : AppIcons.articleOutlined,
                title: emptyTitle,
                message: emptyMessage,
              ),
            ),
          );
        }
        if (threadsOnly) {
          return boxed(
            Column(
              children: [
                for (final p in posts)
                  PostImpressionTracker(
                    key: ValueKey('imp-${p.id}'),
                    post: p,
                    child:
                        PostCard(key: ValueKey(p.id), post: p, showPin: true),
                  ),
                if (page.canLoadMore)
                  TextButton(
                    onPressed: () => ref.read(_provider.notifier).loadMore(),
                    child: Text(t.t('pagination.loadingMore')),
                  ),
              ],
            ),
          );
        }
        if (reelsOnly) {
          return gridWithMore(
            page,
            gridKey: const ValueKey('profile-reels-grid'),
            delegate: reelsGridDelegate(),
            count: posts.length,
            tile: (context, i) => ReelGridTile(
              key: ValueKey('reel-tile-${posts[i].id}'),
              post: posts[i],
              semanticLabel: t.t('post.open'),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => ReelsScreen(initial: posts, initialIndex: i),
                ),
              ),
            ),
          );
        }
        return gridWithMore(
          page,
          delegate: profileGridDelegate(),
          count: posts.length,
          tile: (context, i) {
            final p = posts[i];
            return PostGridTile(
              post: p,
              semanticLabel: t.t('post.open'),
              // Owner 2026-10-15: in a profile a video is only its cover; a
              // tap opens it (search keeps its own autoplay).
              // Owner 2026-10-07: their posts as a feed from here.
              onTap: () => PostsFeedScreen.open(
                context,
                posts: posts,
                index: i,
                subtitle: p.author.username,
              ),
            );
          },
        );
      },
    );
  }
}

/// Owner 2026-10-12 (Threads): an opened text post — the post on top, the
/// replies right under it on the same screen, the reply field pinned at the
/// bottom.
class _ThreadDetail extends ConsumerStatefulWidget {
  const _ThreadDetail({required this.post, required this.fromProfile});

  final Post post;
  final bool fromProfile;

  @override
  ConsumerState<_ThreadDetail> createState() => _ThreadDetailState();
}

class _ThreadDetailState extends ConsumerState<_ThreadDetail> {
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
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = widget.post;
    final comments = ref.watch(commentsProvider(p.id));
    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            color: colors.gold,
            onRefresh: () async {
              ref
                ..invalidate(postProvider(p.id))
                ..invalidate(commentsProvider(p.id));
            },
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: PostImpressionTracker(
                    post: p,
                    child: PostCard(
                      post: p,
                      inDetail: true,
                      fromProfile: widget.fromProfile,
                      onReply: _focus.requestFocus,
                    ),
                  ),
                ),
                SliverToBoxAdapter(
                  child: Divider(height: 1, color: colors.border),
                ),
                ...commentThreadSlivers(
                  context,
                  ref,
                  p.id,
                  comments,
                  _reply,
                  threads: true,
                ),
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenSide,
                    ),
                    child: PostDisclaimer(),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (p.commentsEnabled)
          CommentComposer(
            postId: p.id,
            replyTo: _replyTo,
            focusNode: _focus,
            onClearReply: () => setState(() => _replyTo = null),
          )
        else
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Text(
                t.t('post.comments.off'),
                textAlign: TextAlign.center,
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ),
          ),
      ],
    );
  }
}
