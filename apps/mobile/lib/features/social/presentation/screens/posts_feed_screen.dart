import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

/// Owner 2026-10-07 (Instagram): a tap on a tile of someone's grid opens
/// their posts as a feed, starting at the tapped one; scrolling up shows
/// the newer ones, down the older ones. The name sits once in the header,
/// not above every post; a tap on a post opens it whole.
class PostsFeedScreen extends ConsumerStatefulWidget {
  const PostsFeedScreen({
    required this.posts,
    required this.initialIndex,
    this.subtitle,
    this.oneAuthor = true,
    super.key,
  });

  /// One person's posts (their grid): no author row on each post. Search
  /// results mix people and keep it.
  final bool oneAuthor;

  final List<Post> posts;
  final int initialIndex;

  /// The author's @handle under «Публикации».
  final String? subtitle;

  static Future<void> open(
    BuildContext context, {
    required List<Post> posts,
    required int index,
    String? subtitle,
    bool oneAuthor = true,
  }) =>
      Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute<void>(
          builder: (_) => PostsFeedScreen(
            posts: posts,
            initialIndex: index,
            subtitle: subtitle,
            oneAuthor: oneAuthor,
          ),
        ),
      );

  @override
  ConsumerState<PostsFeedScreen> createState() => _PostsFeedScreenState();
}

class _PostsFeedScreenState extends ConsumerState<PostsFeedScreen> {
  final _center = UniqueKey();

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final deleted = ref.watch(deletedPostsProvider);
    final i0 = widget.initialIndex.clamp(0, widget.posts.length - 1);
    final before = [
      for (final p in widget.posts.take(i0))
        if (!deleted.contains(p.id)) p,
    ].reversed.toList();
    final after = [
      for (final p in widget.posts.skip(i0))
        if (!deleted.contains(p.id)) p,
    ];
    Widget card(Post p) => Padding(
          key: ValueKey(p.id),
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: PostCard(post: p, fromProfile: widget.oneAuthor),
        );
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(t.t('post.feed.title'), maxLines: 1),
            if (widget.subtitle != null)
              Text(
                widget.subtitle!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
          ],
        ),
      ),
      body: CustomScrollView(
        // The tapped post is the first one on screen; newer posts sit
        // above it, older ones below.
        center: _center,
        slivers: [
          SliverList.builder(
            itemCount: before.length,
            itemBuilder: (_, i) => card(before[i]),
          ),
          SliverList.builder(
            key: _center,
            itemCount: after.length,
            itemBuilder: (_, i) => card(after[i]),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: MediaQuery.paddingOf(context).bottom + AppSpacing.xl,
            ),
          ),
        ],
      ),
    );
  }
}
