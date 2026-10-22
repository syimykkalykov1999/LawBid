import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_actions.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// Owner 2026-10-20: the comments under a channel post — oldest first with
/// paging, add, delete your own (a channel admin deletes any).
class ChannelCommentsScreen extends ConsumerStatefulWidget {
  const ChannelCommentsScreen({
    required this.channelId,
    required this.postId,
    super.key,
  });

  final String channelId;
  final String postId;

  static Future<void> open(
    BuildContext context,
    Channel channel,
    ChannelPost post,
  ) =>
      Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => ChannelCommentsScreen(
            channelId: channel.id,
            postId: post.id,
          ),
        ),
      );

  @override
  ConsumerState<ChannelCommentsScreen> createState() =>
      _ChannelCommentsScreenState();
}

class _ChannelCommentsScreenState extends ConsumerState<ChannelCommentsScreen> {
  final _text = TextEditingController();
  bool _sending = false;

  ChannelPostKey get _key =>
      (channelId: widget.channelId, postId: widget.postId);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    final t = ref.read(translatorProvider);
    setState(() => _sending = true);
    try {
      await ref.read(channelCommentsProvider(_key).notifier).add(body);
      _text.clear();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, channelErrorText(t, e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _delete(ChannelComment c) async {
    final t = ref.read(translatorProvider);
    final ok = await confirmChannelAction(
      context,
      ref,
      title: t.t('channel.comment.delete.title'),
      message: t.t('channel.comment.delete.message'),
      confirmLabel: t.t('common.delete'),
    );
    if (!ok || !mounted) return;
    try {
      await ref.read(channelCommentsProvider(_key).notifier).remove(c);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, channelErrorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final comments = ref.watch(channelCommentsProvider(_key));
    final notifier = ref.read(channelCommentsProvider(_key).notifier);
    return ChannelsGate(
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          title: Text(t.t('channel.comments')),
        ),
        body: Column(
          children: [
            Expanded(
              child: PagedListBody<ChannelComment>(
                value: comments,
                t: t,
                itemKey: (c) => c.id,
                empty: ChannelsEmpty(
                  icon: AppIcons.modeCommentOutlined,
                  message: t.t('channel.comments.empty'),
                ),
                onRefresh: () async {
                  ref.invalidate(channelCommentsProvider(_key));
                  await ref.read(channelCommentsProvider(_key).future);
                },
                onLoadMore: notifier.loadMore,
                onRetryMore: notifier.retryLoadMore,
                itemBuilder: (context, c, _) => _CommentRow(
                  comment: c,
                  time: SocialFormat.ago(t, f, c.createdAt),
                  deleteLabel: t.t('channel.comment.delete'),
                  onDelete: c.canDelete ? () => _delete(c) : null,
                ),
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.xs,
                  AppSpacing.sm,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: AppTextField(
                        key: const ValueKey('channel-comment-field'),
                        controller: _text,
                        hintText: t.t('channel.comment.hint'),
                        semanticLabel: t.t('channel.comment.hint'),
                        maxLines: 4,
                        maxLength: kChannelCommentMax,
                        textCapitalization: TextCapitalization.sentences,
                        enabled: !_sending,
                      ),
                    ),
                    ValueListenableBuilder<TextEditingValue>(
                      valueListenable: _text,
                      builder: (context, v, _) => AppIconButton(
                        key: const ValueKey('channel-comment-send'),
                        icon: AppIcon(
                          AppIcons.sendRounded,
                          color: v.text.trim().isEmpty
                              ? colors.textSecondary
                              : colors.iconTint,
                        ),
                        semanticLabel: t.t('channel.comment.send'),
                        isLoading: _sending,
                        onPressed: v.text.trim().isEmpty ? null : _send,
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

class _CommentRow extends StatelessWidget {
  const _CommentRow({
    required this.comment,
    required this.time,
    required this.deleteLabel,
    required this.onDelete,
  });

  final ChannelComment comment;
  final String time;
  final String deleteLabel;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = comment.author;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppAvatar(
            size: 36,
            initials: a.initials.isEmpty ? null : a.initials,
            imageProvider: a.avatarUrl == null
                ? null
                : appNetworkImage(a.avatarUrl!, decodeWidthFor(36)),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        a.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      time,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                ChannelLinkedText(text: comment.body, style: type.bodySmall),
              ],
            ),
          ),
          if (onDelete != null)
            AppIconButton(
              key: ValueKey('channel-comment-delete-${comment.id}'),
              icon: AppIcon(
                AppIcons.deleteOutlineRounded,
                color: colors.textSecondary,
              ),
              semanticLabel: deleteLabel,
              onPressed: onDelete,
            ),
        ],
      ),
    );
  }
}
