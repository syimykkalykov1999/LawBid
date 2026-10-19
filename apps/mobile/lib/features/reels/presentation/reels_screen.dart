import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/shell/web_media_width.dart';
import 'package:lawbid/features/promotions/presentation/promotion_cta_button.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/comments_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_attachments_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_impression_tracker.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/post_text_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

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
    this.embedded = false,
    this.filter,
    this.practice,
    super.key,
  });

  /// Owner 2026-10-12: the Reels tab of the feed — the player without its
  /// own back row, under the feed's filter row.
  final bool embedded;

  /// Keeps only the reels it accepts (the tab's content-mode filter).
  final bool Function(Post)? filter;

  /// The tab's topic: a practice category, filtered by the server with the
  /// same hidden-tag algorithm as the feed.
  final String? practice;

  /// Opened from a feed card: that reel first, then the reels feed.
  final List<Post> initial;
  final int initialIndex;

  /// Owner 2026-10-15: pushed on the tab's own navigator, so the bottom nav
  /// bar stays (as on the Reels tab); from a screen already over the tabs
  /// there is no bar, and the player takes the whole screen.
  static Future<void> open(BuildContext context, {Post? from}) =>
      Navigator.of(context).push(
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
  late final ReelPlayersOpen _open = ref.read(reelPlayersOpenProvider.notifier);
  bool _counted = false;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _load();
    if (!widget.embedded) {
      _counted = true;
      Future.microtask(_open.opened);
    }
  }

  @override
  void dispose() {
    _pages.dispose();
    if (_counted) Future.microtask(_open.closed);
    super.dispose();
  }

  /// The bottom nav bar is on screen under this player (it is a tab's page,
  /// not a screen over the tabs).
  bool get _underNavBar =>
      Navigator.of(context) != Navigator.of(context, rootNavigator: true);

  /// Owner 2026-10-19 (Instagram): while the viewer watches, fresh reels
  /// join the stream on their own — when the next page loads, the newest
  /// page is read too (at most every [_freshGap]) and the reels not seen
  /// yet come in a few reels ahead, never under the one playing.
  DateTime _freshAt = DateTime.now();
  static const _freshGap = Duration(minutes: 3);

  Future<void> _mixFresh() async {
    if (DateTime.now().difference(_freshAt) < _freshGap) return;
    _freshAt = DateTime.now();
    try {
      final page = await ref.read(reelsRepositoryProvider).reels(
            practice: widget.practice,
          );
      if (!mounted) return;
      final seen = _items.map((p) => p.id).toSet();
      final fresh = [
        for (final p in page.items)
          if (!seen.contains(p.id)) p,
      ];
      if (fresh.isEmpty) return;
      // After the reel on screen and the next one (already warmed).
      final deleted = ref.read(deletedPostsProvider);
      final shown = [
        for (final p in _items)
          if (!deleted.contains(p.id) && (widget.filter?.call(p) ?? true)) p,
      ];
      final current = _index < shown.length ? shown[_index] : null;
      final at = current == null
          ? _items.length
          : (_items.indexOf(current) + 2).clamp(0, _items.length);
      setState(() => _items.insertAll(at, fresh));
    } on Object {
      // Quiet: the stream goes on without them.
    }
  }

  Future<void> _load() async {
    if (_loading || !_more) return;
    unawaited(_mixFresh());
    setState(() => _loading = true);
    try {
      final page = await ref.read(reelsRepositoryProvider).reels(
            cursor: _cursor,
            practice: widget.practice,
          );
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

  /// Owner 2026-10-19 (Instagram): pull down on the first reel (or tap the
  /// open tab in the nav bar) — the newest reels from the start.
  Future<void> _refresh() async {
    try {
      final page = await ref.read(reelsRepositoryProvider).reels(
            practice: widget.practice,
          );
      if (!mounted) return;
      // A reel opened from a feed card stays first.
      final keep = [...widget.initial];
      final seen = keep.map((p) => p.id).toSet();
      setState(() {
        _items
          ..clear()
          ..addAll(keep)
          ..addAll(page.items.where((p) => !seen.contains(p.id)));
        _cursor = page.nextCursor;
        _more = page.hasMore;
        _error = null;
        _index = 0;
        _freshAt = DateTime.now();
      });
      if (_pages.hasClients) _pages.jumpToPage(0);
    } on Object catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  /// The player under a pull-to-refresh (white on the dark video).
  Widget _refreshable(Widget child) => RefreshIndicator(
        color: Colors.white,
        backgroundColor: Colors.black54,
        edgeOffset: MediaQuery.paddingOf(context).top + 48,
        onRefresh: _refresh,
        child: child,
      );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final muted = ref.watch(reelsMutedProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // A reel deleted from its "⋯" menu leaves the list.
    final deleted = ref.watch(deletedPostsProvider);
    final items = [
      for (final p in _items)
        if (!deleted.contains(p.id) && (widget.filter?.call(p) ?? true)) p,
    ];
    if (widget.embedded) {
      return ColoredBox(
        color: reelsBackdrop(
          context,
          Theme.of(context).scaffoldBackgroundColor,
        ),
        child: Padding(
          padding: EdgeInsets.zero,
          child: items.isEmpty
              ? Center(
                  child: _loading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Text(
                          _error != null
                              ? errorText(t, _error!)
                              : t.t('reels.empty'),
                          textAlign: TextAlign.center,
                          style: type.body.copyWith(color: Colors.white70),
                        ),
                )
              : _refreshable(
                  PageView.builder(
                    controller: _pages,
                    scrollDirection: Axis.vertical,
                    itemCount: items.length,
                    // Owner 2026-10-15: the neighbours are built (and warmed).
                    allowImplicitScrolling: true,
                    onPageChanged: (i) {
                      setState(() => _index = i);
                      if (i >= items.length - 3) _load();
                    },
                    itemBuilder: (_, i) => WebReelFrame(
                      child: _ReelPage(
                        key: ValueKey(items[i].id),
                        post: items[i],
                        active: i == _index,
                        warm: (i - _index).abs() == 1,
                        muted: muted,
                        embedded: true,
                        soundButton: true,
                      ),
                    ),
                  ),
                ),
        ),
      );
    }
    return SystemNavBandColor(
      color: Colors.black,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: reelsBackdrop(
            context,
            Theme.of(context).scaffoldBackgroundColor,
          ),
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
                _refreshable(
                  PageView.builder(
                    controller: _pages,
                    scrollDirection: Axis.vertical,
                    itemCount: items.length,
                    // Owner 2026-10-15: the neighbours are built (and warmed).
                    allowImplicitScrolling: true,
                    onPageChanged: (i) {
                      setState(() => _index = i);
                      if (i >= items.length - 3) _load();
                    },
                    itemBuilder: (_, i) => WebReelFrame(
                      child: _ReelPage(
                        key: ValueKey(items[i].id),
                        post: items[i],
                        active: i == _index,
                        warm: (i - _index).abs() == 1,
                        muted: muted,
                        embedded: _underNavBar,
                      ),
                    ),
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
    this.warm = false,
    this.embedded = false,
    this.soundButton = false,
    super.key,
  });

  final Post post;
  final bool active;
  final bool muted;

  /// Owner 2026-10-19 (Instagram): the small speaker above the middle of
  /// the reel (the Reels tab; the pushed player has it in its top bar).
  final bool soundButton;

  /// The next or previous reel: its stream is opened ahead.
  final bool warm;

  /// The Reels tab: the compact «Watch» strip sits right above the nav bar.
  final bool embedded;

  @override
  ConsumerState<_ReelPage> createState() => _ReelPageState();
}

class _ReelPageState extends ConsumerState<_ReelPage> {
  /// The viewer paused it (tap on the reel).
  bool _paused = false;

  /// Owner 2026-10-19 (Instagram): paused while the finger is held down.
  bool _held = false;
  final _progress = ValueNotifier<double>(0);
  Timer? _viewTimer;

  @override
  void initState() {
    super.initState();
    _trackView();
  }

  /// Owner 2026-10-12: a reel counts as viewed after a few seconds as the
  /// current one (once per viewer; the server dedups).
  /// Owner 2026-10-18: after ~2 s; the server counts one view per viewer
  /// per 24 h.
  void _trackView() {
    _viewTimer?.cancel();
    if (!widget.active) return;
    _viewTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted || !widget.active) return;
      ref.read(socialActionsProvider).recordView(widget.post);
    });
  }

  @override
  void didUpdateWidget(_ReelPage old) {
    super.didUpdateWidget(old);
    // Coming back to a reel resumes it.
    if (widget.active && !old.active) _paused = false;
    if (widget.active != old.active) _trackView();
  }

  @override
  void dispose() {
    _viewTimer?.cancel();
    _progress.dispose();
    super.dispose();
  }

  /// The inner page; the reel waits paused and plays on when back (see
  /// `covered` in [build]).
  Future<void> _openInside(Post p) => showPostAttachmentsSheet(
        context,
        media: p.media,
        documents: p.attachments,
      );

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
    // Owner 2026-10-13: «Смотреть» only when the reel has attachments; with
    // none the strip goes and the author, text and rail drop down.
    final more = p.hasInner && ref.watch(innerCardsEnabledProvider);
    final moreSpace = (more ? kReelMoreButtonSpace : AppSpacing.md) +
        (widget.embedded ? kReelNavClearance : 0);
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
    // The title is not drawn twice when the text starts with it.
    final title = (p.title ?? '').trim();
    final body = p.body.trim();
    final caption = [
      if (title.isNotEmpty && !body.startsWith(title)) title,
      if (body.isNotEmpty) body,
    ].join('\n');
    const shadow = [Shadow(blurRadius: 8, color: Colors.black54)];

    Widget rail(
      IconData icon,
      String label,
      int? count,
      VoidCallback onTap, {
      Color? color,
      VoidCallback? onCountTap,
    }) =>
        Padding(
          // Owner 2026-10-13: Instagram-like rail — the count in 12, a tight
          // step, whatever the system text size; the icon [kReelRailIcon]
          // (owner 2026-10-19: bigger).
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: MediaQuery.withNoTextScaling(
            child: Semantics(
              button: true,
              label: label,
              excludeSemantics: true,
              child: GestureDetector(
                onTap: onTap,
                behavior: HitTestBehavior.opaque,
                child: Column(
                  children: [
                    AppIcon(
                      icon,
                      size: kReelRailIcon,
                      color: color ?? Colors.white,
                    ),
                    if (count != null && count > 0) ...[
                      const SizedBox(height: 2),
                      GestureDetector(
                        onTap: onCountTap ?? onTap,
                        behavior: HitTestBehavior.opaque,
                        child: Text(
                          SocialFormat.count(f, count),
                          style: type.caption.copyWith(
                            fontSize: 13,
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            shadows: shadow,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
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
          // Owner 2026-10-19: tap = pause / play (the sound is the speaker
          // button); hold = pause, let go = plays on.
          child: GestureDetector(
            onTap: () => setState(() => _paused = !_paused),
            onLongPressStart: (_) => setState(() => _held = true),
            onLongPressEnd: (_) => setState(() => _held = false),
            onLongPressCancel: () => setState(() => _held = false),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (video != null)
                  ReelVideo(
                    video: video,
                    active: widget.active && video.ready,
                    warm: widget.warm && video.ready,
                    muted: widget.muted,
                    paused: _paused || _held || covered,
                    zoomable: true,
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
                // Owner 2026-10-19 (Instagram): a small sound on / off
                // button above the play icon — shown and hidden together
                // with it (a tap pauses: both appear; a tap plays: both
                // go); a tap on it never pauses the reel.
                if (widget.soundButton && video != null && _paused)
                  Center(
                    child: Transform.translate(
                      offset: const Offset(0, -64),
                      child: Semantics(
                        button: true,
                        label:
                            t.t(widget.muted ? 'reels.unmute' : 'reels.mute'),
                        excludeSemantics: true,
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () =>
                              ref.read(reelsMutedProvider.notifier).toggle(),
                          child: Padding(
                            padding: const EdgeInsets.all(AppSpacing.sm),
                            child: Container(
                              width: 30,
                              height: 30,
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.45),
                                shape: BoxShape.circle,
                              ),
                              child: AppIcon(
                                widget.muted
                                    ? AppIcons.speakerSlash
                                    : AppIcons.speakerHigh,
                                size: 16,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
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
                  bottom: moreSpace +
                      AppSpacing.md +
                      MediaQuery.paddingOf(context).bottom,
                  child: Column(
                    children: [
                      // Owner 2026-10-12: the view counter above the actions.
                      if (p.viewCount > 0)
                        Padding(
                          padding: const EdgeInsets.only(bottom: AppSpacing.lg),
                          child: Column(
                            children: [
                              const AppIcon(
                                AppIcons.visibilityOutlined,
                                size: kReelRailIcon,
                                color: Colors.white,
                              ),
                              const SizedBox(height: 2),
                              Text(
                                SocialFormat.count(f, p.viewCount),
                                style: type.caption.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600,
                                  shadows: shadow,
                                ),
                              ),
                            ],
                          ),
                        ),
                      rail(
                        p.likedByMe
                            ? AppIcons.favoriteRounded
                            : AppIcons.favoriteBorderRounded,
                        t.t(p.likedByMe ? 'post.unlike' : 'post.like'),
                        showLikeCount(ref, p) ? p.likeCount : null,
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
                          () => showCommentsSheet(
                            context,
                            postId: p.id,
                            commentsEnabled: p.commentsEnabled,
                          ),
                        ),
                      // Owner 2026-10-18: the same ↻ flow as in the feed.
                      rail(
                        AppIcons.autoModeRounded,
                        t.t(p.repostedByMe ? 'post.unrepost' : 'post.repost'),
                        p.repostCount,
                        () => showRepostSheet(context, ref, p),
                        color: p.repostedByMe ? colors.success : null,
                        onCountTap: () => showRepostersList(context, p.id),
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
                  // Owner 2026-10-15: the text and «Follow» reach out to the
                  // right, 8 dp short of the icon column.
                  end: 60,
                  bottom: moreSpace +
                      AppSpacing.sm +
                      MediaQuery.paddingOf(context).bottom,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Owner 2026-10-15: the advertiser's button.
                      if (p.promotionId != null && p.promotionCta != null) ...[
                        PromotionCtaButton(
                          promotionId: p.promotionId!,
                          cta: p.promotionCta!,
                          authorId: p.author.id,
                          onDark: true,
                          onProfile: () => openAuthorProfile(
                            context,
                            ref,
                            p.author,
                            fromPostId: p.id,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                      ],
                      // The shared author row: Follow at its right edge.
                      // Owner 2026-10-19: a tap on the author counts as a
                      // profile visit from this reel (post insights).
                      PostSourceScope(
                        postId: p.id,
                        child: AuthorHeader(
                          author: p.author,
                          onDark: true,
                          shadows: shadow,
                          avatarSize: 32,
                          gap: AppSpacing.sm,
                          followMaxWidth: 140,
                          showFollow: !p.isMine,
                          boostPostId: p.isMine ? p.id : null,
                          // Owner 2026-10-19: no @username (only in the
                          // profile and search) and no role word «Клиент»
                          // (only on the welcome screen's role choice).
                          subtitle: p.promotionId != null
                              ? t.t('promote.sponsored')
                              : p.locationName ??
                                  (p.author.verified && !p.author.isClient
                                      ? t.t('post.licensedAttorney')
                                      : ''),
                        ),
                      ),
                      if (caption.isNotEmpty) ...[
                        const SizedBox(height: AppSpacing.sm),
                        // A short caption; the whole text is inside (the
                        // button below) — or, with no attachments, opens in
                        // place over the video (owner 2026-10-13).
                        if (more)
                          GestureDetector(
                            onTap:
                                widget.embedded ? () => _openInside(p) : null,
                            child: Text(
                              caption,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: type.body.copyWith(
                                color: Colors.white,
                                shadows: shadow,
                              ),
                            ),
                          )
                        else
                          _ReelCaption(
                            text: caption,
                            moreLabel: t.t('post.more'),
                            style: type.body.copyWith(
                              color: Colors.white,
                              shadows: shadow,
                            ),
                            onMore: () => showPostTextSheet(context, p),
                          ),
                      ],
                    ],
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  // In the Reels tab the nav bar floats over the video's
                  // bottom edge: the thin line sits at the very bottom.
                  bottom: widget.embedded
                      ? 0
                      : MediaQuery.paddingOf(context).bottom,
                  // Owner 2026-10-19 (smooth): the bar moves every frame —
                  // only it repaints, not the reel's text and icons.
                  child: RepaintBoundary(
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
                ),
              ],
            ),
          ),
        ),
        if (more)
          PositionedDirectional(
            start: AppSpacing.lg,
            end: AppSpacing.lg,
            bottom:
                (widget.embedded ? kReelNavTop + kReelNavGap : AppSpacing.md) +
                    MediaQuery.paddingOf(context).bottom,
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
              borderRadius: BorderRadius.circular(14),
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
                ],
                // Owner 2026-10-15: once followed, only the check stays
                // (Instagram) so the author's name keeps its room.
                if (!following)
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: Colors.white,
                        fontSize: 13,
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

/// Owner 2026-10-19: the reel's action icons on the side, as big as on
/// Instagram.
const kReelRailIcon = 28.0;

/// Owner 2026-10-15: in the feed's Reels tab the video runs under the
/// floating nav bar (46 dp plus its margins); the caption, the icon column
/// and the «more» button stand above it.
const kReelNavTop = 54.0;
const kReelNavGap = -4.0;

/// Added to the usual bottom spacing (AppSpacing.md) so the last line
/// stands [kReelNavGap] above the bar.
const kReelNavClearance = kReelNavTop + kReelNavGap - AppSpacing.md;

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

/// Owner 2026-10-13: a reel without attachments — two lines and a grey
/// «ещё» that opens the description sheet.
class _ReelCaption extends StatelessWidget {
  const _ReelCaption({
    required this.text,
    required this.moreLabel,
    required this.style,
    required this.onMore,
  });

  final String text;
  final String moreLabel;
  final TextStyle style;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    if (text.trim().isEmpty) return const SizedBox.shrink();
    return LayoutBuilder(
      builder: (context, box) {
        final painter = TextPainter(
          text: TextSpan(text: text, style: style),
          maxLines: 2,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: box.maxWidth);
        if (!painter.didExceedMaxLines) return Text(text, style: style);
        // "… more" ends the second line, never a third one.
        final base = DefaultTextStyle.of(context).style.merge(style);
        bool fits(int n) {
          final shown =
              n >= text.length ? text : '${text.substring(0, n).trimRight()}…';
          final p = TextPainter(
            text: TextSpan(
              style: base,
              children: [
                TextSpan(text: '$shown '),
                TextSpan(
                  text: moreLabel,
                  style: base.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
            maxLines: 2,
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
          )..layout(maxWidth: box.maxWidth);
          return !p.didExceedMaxLines;
        }

        var lo = 0;
        var hi = text.length;
        while (lo < hi) {
          final mid = (lo + hi + 1) ~/ 2;
          if (fits(mid)) {
            lo = mid;
          } else {
            hi = mid - 1;
          }
        }
        return GestureDetector(
          onTap: onMore,
          child: Text.rich(
            TextSpan(
              style: style,
              children: [
                TextSpan(text: '${text.substring(0, lo).trimRight()}… '),
                TextSpan(
                  text: moreLabel,
                  style: style.copyWith(
                    color: Colors.white70,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
