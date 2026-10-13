import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// Owner 2026-10-13: the inner card of a post and of a reel — modelled on
/// the opened case. Header ("< Post", author, Follow, "…"), text tabs
/// Overview | Documents | Photos, comments only through the sheet.
/// The same card opens from Posts and (for a reel) from the Reels player.
class PostInnerCard extends ConsumerStatefulWidget {
  const PostInnerCard({required this.post, this.onBack, super.key});

  final Post post;

  /// Back arrow; null = the route's own pop.
  final VoidCallback? onBack;

  @override
  ConsumerState<PostInnerCard> createState() => _PostInnerCardState();
}

enum _Tab { overview, documents, photos }

class _PostInnerCardState extends ConsumerState<PostInnerCard> {
  _Tab _tab = _Tab.overview;

  @override
  Widget build(BuildContext context) {
    final p =
        ref.watch(postOverridesProvider.select((m) => m[widget.post.id])) ??
            widget.post;
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final isReel = p.video != null;
    final tabs = <_Tab>[
      _Tab.overview,
      if (p.attachments.isNotEmpty) _Tab.documents,
      if (!isReel && p.media.isNotEmpty) _Tab.photos,
    ];
    final current = tabs.contains(_tab) ? _tab : _Tab.overview;
    String label(_Tab x) => switch (x) {
          _Tab.overview => t.t('postInner.tab.overview'),
          _Tab.documents => t.t('postInner.tab.documents'),
          _Tab.photos => t.t('postInner.tab.photos'),
        };
    int? count(_Tab x) => switch (x) {
          _Tab.documents => p.attachments.length,
          _Tab.photos => p.media.length,
          _ => null,
        };
    return ColoredBox(
      color: colors.bg,
      child: Column(
        children: [
          _InnerHeader(post: p, isReel: isReel, onBack: widget.onBack),
          CaseTextTabs(
            items: [
              for (final x in tabs) CaseTabItem(label(x), count: count(x)),
            ],
            index: tabs.indexOf(current),
            onChanged: (i) => setState(() => _tab = tabs[i]),
          ),
          Expanded(
            child: RefreshIndicator(
              color: colors.gold,
              onRefresh: () async => ref.invalidate(postProvider(p.id)),
              child: ListView(
                padding: EdgeInsets.only(
                  bottom: MediaQuery.paddingOf(context).bottom + AppSpacing.xl,
                ),
                children: [
                  switch (current) {
                    _Tab.overview => _Overview(post: p),
                    _Tab.documents => _Documents(post: p),
                    _Tab.photos => _Photos(post: p),
                  },
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InnerHeader extends ConsumerWidget {
  const _InnerHeader({
    required this.post,
    required this.isReel,
    required this.onBack,
  });

  final Post post;
  final bool isReel;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = post.author;
    final role = a.isClient
        ? t.t('person.client')
        : a.verified
            ? t.t('post.licensedAttorney')
            : '@${a.username}';
    final place = (a.location ?? '').trim();
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.xs,
        AppSpacing.xs,
        AppSpacing.xs,
        AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              AppIconButton(
                icon: const AppIcon(AppIcons.arrowBackRounded),
                semanticLabel: t.t('common.back'),
                onPressed: onBack ?? () => Navigator.of(context).maybePop(),
              ),
              Expanded(
                child: Text(
                  isReel ? t.t('postInner.reelTitle') : t.t('post.title'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.titleLarge.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsetsDirectional.only(start: AppSpacing.md),
            child: Row(
              children: [
                Expanded(
                  child: Semantics(
                    button: true,
                    label: t.t('post.author.open', {'name': a.displayName}),
                    child: AppPressable(
                      onTap: () => openAuthorProfile(context, ref, a),
                      child: Row(
                        children: [
                          GoldRingAvatar(
                            url: a.avatarUrl,
                            initials: a.initials,
                            size: 40,
                            ring: a.verified,
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                AuthorNameLine(
                                  name: a.displayName,
                                  verified: a.verified,
                                  gold: a.isClient,
                                  checkLabel: t.t('post.verified'),
                                  style: type.body.copyWith(
                                    color: colors.text,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  place.isEmpty ? role : '$role · $place',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.caption.copyWith(
                                    color: colors.textSecondary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                // Only on someone else's post — never on my own.
                if (!post.isMine) ...[
                  const SizedBox(width: AppSpacing.sm),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 124),
                    child: FollowButton(
                      attorneyId: a.id,
                      initial: a.isFollowing,
                      outlined: true,
                    ),
                  ),
                ],
                AppIconButton(
                  icon: const AppIcon(AppIcons.moreHorizRounded),
                  semanticLabel: t.t('post.menu'),
                  onPressed: () => showPostMenu(context, ref, post),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Overview extends ConsumerWidget {
  const _Overview({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = post;
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final actions = ref.read(socialActionsProvider);
    final (title, rest) = PostCard.titleAndRest(p);
    final (text, hashtags) = PostCard.splitTrailingTags(rest);
    Future<void> run(Future<Object?> Function() action) async {
      final error = await action();
      if (error != null && context.mounted) {
        showAppSnackBar(context, errorText(t, error));
      }
    }

    final docs = p.attachments.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: AppSpacing.sm),
        if (p.video != null)
          _ReelPlayer(post: p)
        else if (p.media.isNotEmpty)
          PostMediaCarousel(
            media: p.media,
            semanticLabel: t.t('post.media.label'),
            onDoubleTap: () => run(() => actions.like(p)),
            onTap: (i) => showPhotoGallery(
              context,
              urls: [for (final m in p.media) m.url],
              initial: i,
              closeLabel: t.t('common.close'),
            ),
          ),
        const SizedBox(height: AppSpacing.xs),
        PostActionsBar(post: p, run: run, showTime: true),
        PostPracticeChips(post: p),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            0,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (title.isNotEmpty)
                PostBodyText(
                  body: title,
                  expanded: true,
                  mentions: p.mentions,
                  style: type.titleLarge.copyWith(
                    fontFamily: type.body.fontFamily,
                    fontSize: 20,
                    height: 1.25,
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              if (text.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.sm),
                PostBodyText(body: text, expanded: true, mentions: p.mentions),
              ],
              if (hashtags.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  children: [
                    for (final h in hashtags)
                      AppPressable(
                        onTap: () => context.push(
                          SocialRoutes.tag(h.substring(1)),
                        ),
                        child: Text(
                          h,
                          style: type.body.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      ),
                  ],
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Text(
                [
                  t.t('postInner.published', {'date': f.date(p.createdAt)}),
                  if (docs > 0)
                    t.t('postInner.documentsCount', {'count': '$docs'}),
                ].join(' · '),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// The reel's player on the inner card (owner 2026-10-13, like Instagram):
/// it starts by itself while on screen, loops muted, one tap pauses and the
/// next continues; views and duration sit on it.
class _ReelPlayer extends ConsumerStatefulWidget {
  const _ReelPlayer({required this.post});

  final Post post;

  @override
  ConsumerState<_ReelPlayer> createState() => _ReelPlayerState();
}

class _ReelPlayerState extends ConsumerState<_ReelPlayer> {
  bool _visible = false;
  bool _paused = false;

  @override
  Widget build(BuildContext context) {
    final post = widget.post;
    final f = ref.watch(l10nFormatsProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final v = post.video!;
    final cover = v.thumbnailUrl;
    final sec = v.durationSec;
    Widget chip(IconData? icon, String text) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.55),
            borderRadius: BorderRadius.circular(AppRadii.pill),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                AppIcon(icon, size: 14, color: Colors.white),
                const SizedBox(width: 4),
              ],
              Text(
                text,
                style: type.caption.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        );
    return VisibilityDetector(
      key: ValueKey('inner-reel-${post.id}'),
      onVisibilityChanged: (i) {
        final on = i.visibleFraction > 0.6;
        if (on != _visible && mounted) setState(() => _visible = on);
      },
      child: GestureDetector(
        onTap: () => setState(() => _paused = !_paused),
        child: AspectRatio(
          aspectRatio: 1,
          child: Stack(
            fit: StackFit.expand,
            children: [
              ColoredBox(
                color: Colors.black,
                child: cover == null
                    ? null
                    : CachedNetworkImage(
                        imageUrl: cover,
                        fit: BoxFit.cover,
                        errorWidget: (_, __, ___) => const SizedBox.shrink(),
                      ),
              ),
              if (v.status == 'ready' && v.playbackUrl != null)
                ReelVideo(
                  video: v,
                  active: _visible,
                  paused: _paused,
                ),
              PositionedDirectional(
                start: AppSpacing.md,
                bottom: AppSpacing.md,
                child: chip(
                  AppIcons.visibilityOutlined,
                  SocialFormat.count(f, post.viewCount),
                ),
              ),
              if (sec != null && sec > 0)
                PositionedDirectional(
                  end: AppSpacing.md,
                  bottom: AppSpacing.md,
                  child: chip(null, _clock(sec)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

String _clock(int sec) =>
    '${sec ~/ 60}:${(sec % 60).toString().padLeft(2, '0')}';

String _size(Translator t, int bytes) {
  if (bytes >= 1024 * 1024) {
    return t
        .t('postInner.size.mb', {'n': (bytes / 1048576).toStringAsFixed(1)});
  }
  return t.t(
    'postInner.size.kb',
    {'n': '${(bytes / 1024).ceil().clamp(1, 1 << 30)}'},
  );
}

class _Documents extends ConsumerWidget {
  const _Documents({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    if (post.attachments.isEmpty) {
      return _Empty(text: t.t('postInner.docs.empty'));
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Column(
        children: [
          for (final d in post.attachments)
            Container(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: colors.border)),
              ),
              child: Row(
                children: [
                  AppIcon(
                    AppIcons.descriptionOutlined,
                    size: 24,
                    color: colors.gold,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          d.fileName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          _size(t, d.sizeBytes),
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  FileOpenButton.ref(
                    key: ValueKey(d.fileId),
                    file: FileRef(
                      fileId: d.fileId,
                      mime: d.mime,
                      url: d.url,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Photos extends ConsumerWidget {
  const _Photos({required this.post});

  final Post post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    if (post.media.isEmpty) return _Empty(text: t.t('postInner.photos.empty'));
    final urls = [for (final m in post.media) m.url];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: GridView.count(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        crossAxisCount: 3,
        mainAxisSpacing: 4,
        crossAxisSpacing: 4,
        children: [
          for (final (i, m) in post.media.indexed)
            Semantics(
              button: true,
              label: t.t('postInner.photo.open', {'n': '${i + 1}'}),
              child: AppPressable(
                onTap: () => showPhotoGallery(
                  context,
                  urls: urls,
                  initial: i,
                  closeLabel: t.t('common.close'),
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: CachedNetworkImage(
                    imageUrl: m.previewUrl,
                    fit: BoxFit.cover,
                    errorWidget: (_, __, ___) => const ColoredBox(
                      color: Colors.black26,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: Center(
        child: Text(
          text,
          style: type.body.copyWith(color: colors.textSecondary),
        ),
      ),
    );
  }
}
