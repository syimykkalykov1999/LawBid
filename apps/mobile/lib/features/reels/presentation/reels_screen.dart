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
/// the bottom, a thin progress line.
class ReelsScreen extends ConsumerStatefulWidget {
  const ReelsScreen({this.initial = const [], this.initialIndex = 0, super.key});

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
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            if (_items.isEmpty)
              Center(
                child: _loading
                    ? const CircularProgressIndicator(color: Colors.white)
                    : Padding(
                        padding: const EdgeInsets.all(AppSpacing.xl),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const AppIcon(AppIcons.filmReelOutlined,
                                size: 48, color: Colors.white70),
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
                itemCount: _items.length,
                onPageChanged: (i) {
                  setState(() => _index = i);
                  if (i >= _items.length - 3) _load();
                },
                itemBuilder: (_, i) => _ReelPage(
                  post: _items[i],
                  active: i == _index,
                  muted: muted,
                ),
              ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: t.t('common.back'),
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const AppIcon(AppIcons.closeRounded,
                          color: Colors.white),
                    ),
                    Text(
                      t.t('reels.title'),
                      style: type.titleMedium.copyWith(
                          color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                    const Spacer(),
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
    );
  }
}

class _ReelPage extends ConsumerStatefulWidget {
  const _ReelPage({
    required this.post,
    required this.active,
    required this.muted,
  });

  final Post post;
  final bool active;
  final bool muted;

  @override
  ConsumerState<_ReelPage> createState() => _ReelPageState();
}

class _ReelPageState extends ConsumerState<_ReelPage> {
  bool _paused = false;
  bool _expanded = false;
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

  @override
  Widget build(BuildContext context) {
    final p = ref.watch(
            postOverridesProvider.select((m) => m[widget.post.id])) ??
        widget.post;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final actions = ref.read(socialActionsProvider);
    Future<void> run(Future<Object?> Function() a) async {
      final e = await a();
      if (e != null && context.mounted) showAppSnackBar(context, errorText(t, e));
    }

    final video = p.video;
    final caption = [
      if ((p.title ?? '').trim().isNotEmpty) p.title!.trim(),
      if (p.body.trim().isNotEmpty) p.body.trim(),
    ].join('\n');
    const shadow = [Shadow(blurRadius: 8, color: Colors.black54)];

    Widget rail(IconData icon, String label, int? count, VoidCallback onTap,
            {Color? color}) =>
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
                          shadows: shadow),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );

    return DoubleTapLike(
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
                paused: _paused,
                onProgress: (v) => _progress.value = v,
              ),
            if (video != null && !video.ready)
              Center(
                child: Text(
                  t.t('reels.processing'),
                  style: type.body.copyWith(color: Colors.white70),
                ),
              ),
            if (_paused)
              const Center(
                child: AppIcon(AppIcons.playArrowRounded,
                    size: 72, color: Colors.white70),
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
            Positioned(
              right: AppSpacing.md,
              bottom: AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
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
                  rail(AppIcons.modeCommentOutlined, t.t('post.comments'),
                      p.commentCount, () {
                    setState(() => _paused = true);
                    context.push(SocialRoutes.post(p.id));
                  }),
                  rail(AppIcons.sendOutlined, t.t('post.share'),
                      p.shareCount, () => sharePost(context, ref, p)),
                  rail(
                    p.savedByMe
                        ? AppIcons.bookmarkRounded
                        : AppIcons.bookmarkBorderRounded,
                    t.t(p.savedByMe ? 'post.unsave' : 'post.save'),
                    null,
                    () => run(() => actions.toggleSave(p)),
                    color: p.savedByMe ? colors.gold : null,
                  ),
                ],
              ),
            ),
            Positioned(
              left: AppSpacing.lg,
              right: 72,
              bottom: AppSpacing.xl + MediaQuery.paddingOf(context).bottom,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 16,
                        backgroundColor: Colors.white24,
                        backgroundImage: p.author.avatarUrl == null
                            ? null
                            : CachedNetworkImageProvider(p.author.avatarUrl!),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Flexible(
                        child: Text(
                          p.author.displayName,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              shadows: shadow),
                        ),
                      ),
                      if (p.author.verified) ...[
                        const SizedBox(width: 4),
                        AppIcon(AppIcons.verifiedRounded,
                            size: 16, color: colors.gold),
                      ],
                    ],
                  ),
                  if (caption.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sm),
                    GestureDetector(
                      onTap: () => setState(() => _expanded = !_expanded),
                      child: Text(
                        caption,
                        maxLines: _expanded ? 12 : 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(
                            color: Colors.white, shadows: shadow),
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
    );
  }
}
