import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/buttons/player_round_button.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_actions.dart';
import 'package:lawbid/features/channels/presentation/channel_comments_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_composer_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/domain/social_models.dart'
    show PostMedia, PostVideo;
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show PostMediaCarousel;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// Owner 2026-10-20: one post of a channel — text (links tappable), photos
/// or a video, one reaction per reader, comments (when the channel allows),
/// views, share, and edit / delete for the channel's admins.
class ChannelPostCard extends ConsumerWidget {
  const ChannelPostCard({required this.channel, required this.post, super.key});

  final Channel channel;
  final ChannelPost post;

  Future<void> _react(BuildContext context, WidgetRef ref, String emoji) async {
    final t = ref.read(translatorProvider);
    try {
      await ref
          .read(channelPostsProvider(channel.id).notifier)
          .toggleReaction(post, emoji);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, channelErrorText(t, e));
    }
  }

  Future<void> _pickReaction(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final emoji = await showAppBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  for (final e in kChannelReactions)
                    _EmojiButton(
                      key: ValueKey('channel-pick-$e'),
                      emoji: e,
                      selected: post.myReaction == e,
                      label: t.t('channel.react.pick', {'emoji': e}),
                      onTap: () => Navigator.of(sheet).pop(e),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (emoji != null && context.mounted) await _react(context, ref, emoji);
  }

  Future<void> _menu(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    await showAppBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (channel.isAdmin)
              AppListRow(
                key: const ValueKey('channel-post-edit'),
                icon: AppIcons.editOutlined,
                label: t.t('common.edit'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  ChannelComposerScreen.openEdit(context, channel, post);
                },
              ),
            AppListRow(
              icon: AppIcons.iosShareRounded,
              label: t.t('channel.share'),
              showChevron: false,
              onTap: () {
                Navigator.of(sheet).pop();
                shareChannel(context, ref, channel, postId: post.id);
              },
            ),
            if (!channel.isAdmin)
              AppListRow(
                key: const ValueKey('channel-post-report'),
                icon: AppIcons.flagOutlined,
                label: t.t('post.menu.report'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  showChannelReportSheet(
                    context,
                    ref,
                    targetId: post.id,
                    post: true,
                  );
                },
              ),
            if (channel.isAdmin)
              AppListRow(
                key: const ValueKey('channel-post-delete'),
                icon: AppIcons.deleteOutlineRounded,
                label: t.t('common.delete'),
                destructive: true,
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  _delete(context, ref);
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _delete(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final ok = await confirmChannelAction(
      context,
      ref,
      title: t.t('channel.post.delete.title'),
      message: t.t('channel.post.delete.message'),
      confirmLabel: t.t('common.delete'),
    );
    if (!ok || !context.mounted) return;
    try {
      await ref.read(channelPostsProvider(channel.id).notifier).remove(post);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, channelErrorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final media = [
      for (final m in post.media)
        PostMedia(
          fileId: m.fileId,
          url: m.url,
          previewUrl: m.previewUrl,
          mediumUrl: m.url,
        ),
    ];
    final video = post.video;
    final ago = SocialFormat.ago(t, f, post.createdAt);
    final when =
        post.editedAt == null ? ago : '$ago · ${t.t('channel.post.edited')}';
    return VisibilityDetector(
      key: ValueKey('channel-post-${post.id}'),
      onVisibilityChanged: (info) {
        if (info.visibleFraction >= 0.5) {
          ref.read(channelPostsProvider(channel.id).notifier).viewed(post.id);
        }
      },
      child: AppCard(
        key: ValueKey('channel-post-card-${post.id}'),
        padding: EdgeInsets.zero,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (video != null)
              ChannelVideoView(
                key: ValueKey('channel-video-${post.id}'),
                video: video,
              ),
            if (media.isNotEmpty)
              ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(AppRadii.card),
                ),
                child: PostMediaCarousel(
                  media: media,
                  inList: true,
                  semanticLabel: t.t('channel.post.photos'),
                  onDoubleTap: () {
                    if (post.myReaction == null) _react(context, ref, '❤️');
                  },
                  onTap: (i) => showPhotoGallery(
                    context,
                    urls: [for (final m in media) m.url],
                    initial: i,
                    closeLabel: t.t('common.close'),
                  ),
                ),
              ),
            if (post.body.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.sm,
                  AppSpacing.lg,
                  0,
                ),
                child: ChannelLinkedText(text: post.body, collapsedLines: 10),
              ),
            // Owner 2026-10-20 (Telegram): small reaction chips from the
            // start edge right under the text; nothing is centered.
            if (post.reactions.any((r) => r.count > 0))
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.sm,
                  AppSpacing.lg,
                  0,
                ),
                child: Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  children: [
                    for (final r in post.reactions)
                      if (r.count > 0)
                        _ReactionChip(
                          key: ValueKey('channel-react-${r.emoji}'),
                          emoji: r.emoji,
                          count: SocialFormat.count(f, r.count),
                          selected: post.myReaction == r.emoji,
                          label: t.t('channel.react.chip', {
                            'emoji': r.emoji,
                            'count': '${r.count}',
                          }),
                          onTap: () => _react(context, ref, r.emoji),
                        ),
                  ],
                ),
              ),
            // Icons with their numbers on the start side, views and the
            // time at the end (Telegram), then the menu.
            Padding(
              padding: const EdgeInsetsDirectional.fromSTEB(
                AppSpacing.md,
                0,
                AppSpacing.xs,
                AppSpacing.xs,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: AlignmentDirectional.centerStart,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          _ActionButton(
                            key: const ValueKey('channel-react-add'),
                            icon: AppIcons.thumbUpAltOutlined,
                            label: t.t('channel.react.add'),
                            text: post.reactionTotal > 0
                                ? SocialFormat.count(f, post.reactionTotal)
                                : null,
                            onTap: () => _pickReaction(context, ref),
                          ),
                          if (channel.commentsEnabled)
                            _ActionButton(
                              key: const ValueKey('channel-post-comments'),
                              icon: AppIcons.modeCommentOutlined,
                              label: t.t('channel.comments'),
                              text: post.commentCount > 0
                                  ? SocialFormat.count(f, post.commentCount)
                                  : null,
                              onTap: () => ChannelCommentsScreen.open(
                                context,
                                channel,
                                post,
                              ),
                            ),
                          _ActionButton(
                            key: const ValueKey('channel-post-share'),
                            icon: AppIcons.iosShareRounded,
                            label: t.t('channel.share'),
                            text: post.shareCount > 0
                                ? SocialFormat.count(f, post.shareCount)
                                : null,
                            onTap: () => shareChannel(
                              context,
                              ref,
                              channel,
                              postId: post.id,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppIcon(
                    AppIcons.visibilityOutlined,
                    size: 16,
                    color: colors.textSecondary,
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Semantics(
                    label: SocialFormat.plural(
                      t,
                      f,
                      'channel.post.views',
                      post.viewCount,
                    ),
                    excludeSemantics: true,
                    child: Text(
                      '${SocialFormat.count(f, post.viewCount)} · $when',
                      maxLines: 1,
                      style: type.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ),
                  AppIconButton(
                    key: const ValueKey('channel-post-menu'),
                    icon: AppIcon(AppIcons.moreVertRounded, color: colors.text),
                    semanticLabel: t.t('channel.post.menu'),
                    onPressed: () => _menu(context, ref),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ReactionChip extends StatelessWidget {
  const _ReactionChip({
    required this.emoji,
    required this.count,
    required this.selected,
    required this.label,
    required this.onTap,
    super.key,
  });

  final String emoji;
  final String count;
  final bool selected;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        onTap: onTap,
        // Compact (28), as wide as its content, never stretched.
        child: AppChip(
          label: '$emoji $count',
          selected: selected,
          height: 28,
          onTap: onTap,
        ),
      );
}

class _EmojiButton extends StatelessWidget {
  const _EmojiButton({
    required this.emoji,
    required this.selected,
    required this.label,
    required this.onTap,
    super.key,
  });

  final String emoji;
  final bool selected;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Container(
          width: AppSizes.hitTarget,
          height: AppSizes.hitTarget,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: selected ? colors.goldTint : null,
            border: Border.all(
              color: selected ? colors.goldStroke : colors.border,
            ),
          ),
          child: Text(emoji, style: type.titleLarge),
        ),
      ),
    );
  }
}

/// A small icon button with an optional count beside it (≥ 44 dp to tap).
class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.text,
    super.key,
  });

  final IconData icon;
  final String label;
  final String? text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: text == null ? label : '$label, $text',
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minWidth: AppSizes.touchTarget,
            minHeight: AppSizes.touchTarget,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AppIcon(icon, size: 20, color: colors.textSecondary),
              if (text != null) ...[
                const SizedBox(width: AppSpacing.xs),
                Text(
                  text!,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A post's video: plays muted while most of it is on screen (the reels
/// player), with a speaker toggle; a video still processing shows its cover.
class ChannelVideoView extends ConsumerStatefulWidget {
  const ChannelVideoView({required this.video, super.key});

  final PostVideo video;

  @override
  ConsumerState<ChannelVideoView> createState() => _ChannelVideoViewState();
}

class _ChannelVideoViewState extends ConsumerState<ChannelVideoView> {
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final video = widget.video;
    final muted = ref.watch(reelsMutedProvider);
    // The picture keeps its own shape between 4:5 and 16:9.
    final ratio = video.aspectRatio.clamp(0.8, 1.78);
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(
        top: Radius.circular(AppRadii.card),
      ),
      child: AspectRatio(
        aspectRatio: ratio,
        child: VisibilityDetector(
          key: ValueKey('channel-video-visible-${video.playbackUrl}'),
          onVisibilityChanged: (info) {
            final v = info.visibleFraction > 0.6;
            if (v != _visible && mounted) setState(() => _visible = v);
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              ReelVideo(
                video: video,
                active: _visible && video.ready,
                warm: video.ready,
                muted: muted,
              ),
              if (!video.ready)
                Center(
                  child: Semantics(
                    label:
                        video.status == 'failed' || video.status == 'rejected'
                            ? t.t('channel.video.failed')
                            : t.t('channel.video.processing'),
                    child: const AppIcon(
                      AppIcons.filmReelOutlined,
                      size: 40,
                    ),
                  ),
                ),
              if (video.ready)
                PositionedDirectional(
                  end: AppSpacing.md,
                  bottom: AppSpacing.md,
                  child: PlayerRoundButton(
                    icon: muted ? AppIcons.speakerSlash : AppIcons.speakerHigh,
                    size: 32,
                    semanticLabel: muted
                        ? t.t('channel.video.unmute')
                        : t.t('channel.video.mute'),
                    onTap: () => ref.read(reelsMutedProvider.notifier).toggle(),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
