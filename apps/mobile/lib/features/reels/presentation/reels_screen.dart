import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/presentation/reel_detail_screen.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';

/// Owner 2026-10-01 — reels exactly like Instagram: full screen, swipe up
/// for the next one, the current reel plays with sound and loops; tap
/// pauses, double tap likes; actions on the right, author and caption at
/// the bottom, a thin progress line. Owner 2026-10-05: a back arrow at the
/// top left and a wide, low button pinned above the bottom ("Смотреть" /
/// "Читать") that opens the reel's inner page — title, text, photos and
/// documents.
class ReelsScreen extends ConsumerStatefulWidget {
  const ReelsScreen({
    this.initial = const [],
    this.initialIndex = 0,
    super.key,
  });

  /// Opened from a feed card: that reel first, then the reels feed.
  final List<Post> initial;
  final int initialIndex;

  static Future<void> open(BuildContext context, {Post? from}) =>
      Navigator.of(context, rootNavigator: true).push(
        MaterialPageRoute<void>(
          builder: (_) => ReelsScreen(initial: [if (from != null) from]),
        ),
      );

  @override
  ConsumerState<ReelsScreen> createState() => _ReelsScreenState();
}

class _ReelsScreenState extends ConsumerState<ReelsScreen> {
  late final PageController _pages =
      PageController(initialPage: widget.initialIndex);
  late final List<Post> _items = [...widget.initial];
  String? _cursor;
  bool _more = true;
  bool _loading = false;
  Object? _error;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _load();
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_loading || !_more) return;
    setState(() => _loading = true);
    try {
      final page =
          await ref.read(reelsRepositoryProvider).reels(cursor: _cursor);
      final seen = _items.map((p) => p.id).toSet();
      setState(() {
        _items.addAll(page.items.where((p) => !seen.contains(p.id)));
        _cursor = page.nextCursor;
        _more = page.hasMore;
        _error = null;
      });
    } on Object catch (e) {
      setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final muted = ref.watch(reelsMutedProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // A reel deleted from its "⋯" menu leaves the list.
    final deleted = ref.watch(deletedPostsProvider);
    final items = [
      for (final p in _items)
        if (!deleted.contains(p.id)) p,
    ];
    return SystemNavBandColor(
      color: Colors.black,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            children: [
              if (items.isEmpty)
                Center(
                  child: _loading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Padding(
                          padding: const EdgeInsets.all(AppSpacing.xl),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const AppIcon(
                                AppIcons.filmReelOutlined,
                                size: 48,
                                color: Colors.white70,
                              ),
                              const SizedBox(height: AppSpacing.md),
                              Text(
                                _error != null
                                    ? errorText(t, _error!)
                                    : t.t('reels.empty'),
                                textAlign: TextAlign.center,
                                style:
                                    type.body.copyWith(color: Colors.white70),
                              ),
                            ],
                          ),
                        ),
                )
              else
                PageView.builder(
                  controller: _pages,
                  scrollDirection: Axis.vertical,
                  itemCount: items.length,
                  onPageChanged: (i) {
                    setState(() => _index = i);
                    if (i >= items.length - 3) _load();
                  },
                  itemBuilder: (_, i) => _ReelPage(
                    key: ValueKey(items[i].id),
                    post: items[i],
                    active: i == _index,
                    muted: muted,
                  ),
                ),
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xs,
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        tooltip: t.t('common.back'),
                        onPressed: () => Navigator.of(context).maybePop(),
                        icon: const AppIcon(
                          AppIcons.arrowBackRounded,
                          color: Colors.white,
                          size: 26,
                        ),
                      ),
                      Expanded(
                        child: Text(
                          t.t('reels.title'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.titleMedium.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: t.t(muted ? 'reels.unmute' : 'reels.mute'),
                        onPressed: () =>
                            ref.read(reelsMutedProvider.notifier).toggle(),
                        icon: AppIcon(
                          muted ? AppIcons.speakerSlash : AppIcons.speakerHigh,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReelPage extends ConsumerStatefulWidget {
  const _ReelPage({
    required this.post,
    required this.active,
    required this.muted,
    super.key,
  });

  final Post post;
  final bool active;
  final bool muted;

  @override
  ConsumerState<_ReelPage> createState() => _ReelPageState();
}

class _ReelPageState extends ConsumerState<_ReelPage> {
  bool _paused = false;
  final _progress = ValueNotifier<double>(0);

  @override
  void didUpdateWidget(_ReelPage old) {
    super.didUpdateWidget(old);
    // Coming back to a reel resumes it.
    if (widget.active && !old.active) _paused = false;
  }

  @override
  void dispose() {
    _progress.dispose();
    super.dispose();
  }

  /// The inner page; the reel waits paused and plays on when back (see
  /// `covered` in [build]).
  Future<void> _openInside(Post p) => ReelDetailScreen.open(context, p);

  @override
  Widget build(BuildContext context) {
    final p = ref.watch(
          postOverridesProvider.select((m) => m[widget.post.id]),
        ) ??
        widget.post;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final actions = ref.read(socialActionsProvider);
    Future<void> run(Future<Object?> Function() a) async {
      final e = await a();
      if (e != null && context.mounted) {
        showAppSnackBar(context, errorText(t, e));
      }
    }

    // Owner 2026-10-05: anything opened over the reel (comments, the
    // share sheet, the "⋯" menu, the author's profile, the inside) pauses
    // it; back on the reel it plays on, unless the viewer paused it.
    final covered = !(ModalRoute.of(context)?.isCurrent ?? true);
    final video = p.video;
    final caption = [
      if ((p.title ?? '').trim().isNotEmpty) p.title!.trim(),
      if (p.body.trim().isNotEmpty) p.body.trim(),
    ].join('\n');
    const shadow = [Shadow(blurRadius: 8, color: Colors.black54)];

    Widget rail(
      IconData icon,
      String label,
      int? count,
      VoidCallback onTap, {
      Color? color,
    }) =>
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.lg),
          child: Semantics(
            button: true,
            label: label,
            excludeSemantics: true,
            child: GestureDetector(
              onTap: onTap,
              behavior: HitTestBehavior.opaque,
              child: Column(
                children: [
                  AppIcon(icon, size: 30, color: color ?? Colors.white),
                  if (count != null && count > 0) ...[
                    const SizedBox(height: 2),
                    Text(
                      SocialFormat.count(f, count),
                      style: type.caption.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        shadows: shadow,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );

    // The button sits outside the double-tap area: it opens at once.
    return Stack(
      fit: StackFit.expand,
      children: [
        DoubleTapLike(
          onLike: () => run(() => actions.like(p)),
          child: GestureDetector(
            onTap: () => setState(() => _paused = !_paused),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (video != null)
                  ReelVideo(
                    video: video,
                    active: widget.active && video.ready,
                    muted: widget.muted,
                    paused: _paused || covered,
                    onProgress: (v) => _progress.value = v,
                  ),
                if (video != null && !video.ready)
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.screenSide,
                      ),
                      child: Text(
                        t.t('reels.processing'),
                        textAlign: TextAlign.center,
                        style: type.body.copyWith(color: Colors.white70),
                      ),
                    ),
                  ),
                if (_paused)
                  const Center(
                    child: AppIcon(
                      AppIcons.playArrowRounded,
                      size: 72,
                      color: Colors.white70,
                    ),
                  ),
                // Bottom shade so the caption reads on any video.
                const Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 260,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.bottomCenter,
                          end: Alignment.topCenter,
                          colors: [Colors.black87, Colors.transparent],
                        ),
                      ),
                    ),
                  ),
                ),
                PositionedDirectional(
                  end: AppSpacing.md,
                  bottom: kReelMoreButtonSpace +
                      AppSpacing.md +
                      MediaQuery.paddingOf(context).bottom,
                  child: Column(
                    children: [
                      rail(
                        p.likedByMe
                            ? AppIcons.favoriteRounded
                            : AppIcons.favoriteBorderRounded,
                        t.t(p.likedByMe ? 'post.unlike' : 'post.like'),
                        p.likeCount,
                        () => run(() => actions.toggleLike(p)),
                        color: p.likedByMe ? colors.danger : null,
                      ),
                      // Owner 2026-10-07: comments off → no comments
                      // button (the server refuses them anyway).
                      if (p.commentsEnabled)
                        rail(
                          AppIcons.modeCommentOutlined,
                          t.t('post.comments'),
                          p.commentCount,
                          () => context.push(SocialRoutes.post(p.id)),
                        ),
                      rail(
                        AppIcons.sendOutlined,
                        t.t('post.share'),
                        p.shareCount,
                        () => sharePost(context, ref, p),
                      ),
                      rail(
                        p.savedByMe
                            ? AppIcons.bookmarkRounded
                            : AppIcons.bookmarkBorderRounded,
                        t.t(p.savedByMe ? 'post.unsave' : 'post.save'),
                        null,
                        () => run(() => actions.toggleSave(p)),
                        color: p.savedByMe ? colors.gold : null,
                      ),
                      rail(
                        AppIcons.moreHorizRounded,
                        t.t('post.menu'),
                        null,
                        () => showPostMenu(context, ref, p),
                      ),
                    ],
                  ),
                ),
                PositionedDirectional(
                  start: AppSpacing.lg,
                  end: 72,
                  bottom: kReelMoreButtonSpace +
                      AppSpacing.sm +
                      MediaQuery.paddingOf(context).bottom,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Owner 2026-10-05: «Подписаться» right after the
                      // author's name, like the feed card.
                      Row(
                        children: [
                          Flexible(
                            child: Semantics(
                              button: true,
                              label: t.t(
                                'post.author.open',
                                {'name': p.author.displayName},
                              ),
                              child: GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: () =>
                                    openAuthorProfile(context, ref, p.author),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    // Initials under the photo.
                                    AppAvatar(
                                      size: 32,
                                      initials: p.author.initials,
                                      imageProvider: p.author.avatarUrl == null
                                          ? null
                                          : CachedNetworkImageProvider(
                                              p.author.avatarUrl!,
                                            ),
                                    ),
                                    const SizedBox(width: AppSpacing.sm),
                                    Flexible(
                                      child: Text(
                                        p.author.displayName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: type.body.copyWith(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w700,
                                          shadows: shadow,
                                        ),
                                      ),
                                    ),
                                    // Attorneys blue, clients gold — as on
                                    // the feed card.
                                    if (p.author.verified) ...[
                                      const SizedBox(width: 4),
                                      VerifiedCheck(
                                        label: t.t('post.verified'),
                                        gold: p.author.isClient,
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ),
                          ),
                          if (!p.isMine) ...[
                            const SizedBox(width: AppSpacing.sm),
                            // Capped so a long translation can't squeeze
                            // the name away.
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 140),
                              child: ReelFollowButton(
                                attorneyId: p.author.id,
                                initial: p.author.isFollowing,
                              ),
                            ),
                          ],
                        ],
                      ),
                      if (p.locationName != null) ...[
                        const SizedBox(height: AppSpacing.xs),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const AppIcon(
                              AppIcons.locationOnOutlined,
                              size: 14,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                p.locationName!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: type.caption.copyWith(
                                  color: Colors.white,
                                  shadows: shadow,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                      if (caption.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.sm),
                        // A short caption; the whole text is inside (the
                        // button below).
                        Text(
                          caption,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: Colors.white,
                            shadows: shadow,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: MediaQuery.paddingOf(context).bottom,
                  child: ValueListenableBuilder<double>(
                    valueListenable: _progress,
                    builder: (_, v, __) => LinearProgressIndicator(
                      value: v,
                      minHeight: 2,
                      backgroundColor: Colors.white24,
                      color: Colors.white,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        PositionedDirectional(
          start: AppSpacing.lg,
          end: AppSpacing.lg,
          bottom: AppSpacing.md + MediaQuery.paddingOf(context).bottom,
          child: ReelMoreButton(
            label: t.t(reelMoreLabelKey(p)),
            onTap: () => _openInside(p),
          ),
        ),
      ],
    );
  }
}

/// Owner 2026-10-05: «Подписаться» on a reel — a white outline that reads
/// on any video; after a tap it shows the check and «Вы подписаны» (tap
/// again to unfollow). Same follow state as the feed card's button.
class ReelFollowButton extends ConsumerWidget {
  const ReelFollowButton({
    required this.attorneyId,
    required this.initial,
    super.key,
  });

  final String attorneyId;
  final bool initial;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final following =
        ref.watch(followOverridesProvider.select((m) => m[attorneyId])) ??
            initial;
    final label = t.t(following ? 'follow.following' : 'follow.follow');
    return Semantics(
      button: true,
      toggled: following,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () async {
          final error = await ref
              .read(socialActionsProvider)
              .setFollowing(attorneyId, !following);
          if (error != null && context.mounted) {
            showAppSnackBar(context, errorText(t, error));
          }
        },
        // A 40 dp tap target around a 28 dp pill.
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Container(
            height: 28,
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            decoration: BoxDecoration(
              color: following
                  ? Colors.white.withValues(alpha: 0.18)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.white70),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (following) ...[
                  const AppIcon(
                    AppIcons.checkRounded,
                    size: 14,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 4),
                ],
                Flexible(
                  child: Text(
                    label,
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
    );
  }
}

/// Height of the pinned button plus its gap to the bottom.
const kReelMoreButtonSpace = 44.0 + AppSpacing.md;

/// "Смотреть" when the reel has photos or documents inside, else "Читать".
String reelMoreLabelKey(Post p) =>
    p.media.isNotEmpty || p.attachments.isNotEmpty
        ? 'reels.more.watch'
        : 'reels.more.read';

/// Owner 2026-10-05: the wide, low button over the bottom of a reel.
class ReelMoreButton extends StatelessWidget {
  const ReelMoreButton({required this.label, required this.onTap, super.key});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: Colors.white.withValues(alpha: 0.18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: Colors.white38),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: SizedBox(
            height: 44,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: Row(
                children: [
                  const AppIcon(
                    AppIcons.bookOpenTextOutlined,
                    size: 20,
                    color: Colors.white,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const AppIcon(
                    AppIcons.chevronRightRounded,
                    size: 20,
                    color: Colors.white,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
