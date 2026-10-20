import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_album.dart';
import 'package:lawbid/features/chat/presentation/chat_video.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_bubble.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_rich_text.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_style.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_swipe_to_reply.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show GoldRingAvatar;
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart'
    show openProfile;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The corner shape of a bubble: the corner at the sender's side is tight.
BorderRadiusDirectional _radius({required bool mine}) =>
    BorderRadiusDirectional.only(
      topStart: const Radius.circular(18),
      topEnd: const Radius.circular(18),
      bottomStart: Radius.circular(mine ? 18 : 4),
      bottomEnd: Radius.circular(mine ? 4 : 18),
    );

/// Opens a person's public profile when the app has one for them.
void openGroupPerson(
  BuildContext context,
  WidgetRef ref,
  api.GroupPersonDto person,
) {
  final username = person.username;
  if (username == null || username.isEmpty) return;
  openProfile(
    context,
    ref,
    id: person.userId,
    username: username,
    isClient: person.kind == api.GroupPersonDtoKind.client,
  );
}

/// One message of a group chat: sender name and avatar for other people,
/// reply preview, text with links and mentions, a photo or file, a poll,
/// the edited mark and the time. Long-press / right-click opens [onMenu];
/// dragging toward the start edge calls [onReply].
class GroupMessageBubble extends ConsumerWidget {
  const GroupMessageBubble({
    required this.message,
    required this.groupId,
    required this.showName,
    required this.showAvatar,
    required this.canClose,
    required this.highlighted,
    required this.onMenu,
    required this.onPollChanged,
    this.onReply,
    this.onJump,
    super.key,
  });

  final api.GroupMessageDto message;
  final String groupId;

  /// First message of a run from this sender: the name is shown.
  final bool showName;

  /// Last message of a run from this sender: the avatar is shown.
  final bool showAvatar;
  final bool canClose;

  /// Briefly tinted after a jump to this message.
  final bool highlighted;
  final VoidCallback onMenu;
  final void Function(api.PollDto poll) onPollChanged;

  /// Null: replying is not possible (read-only chat, deleted message).
  final VoidCallback? onReply;
  final void Function(String messageId)? onJump;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final brightness = Theme.of(context).brightness;
    final m = message;
    final mine = m.mine;
    final fg = mine ? chat.onMine : chat.onTheirs;
    final meta = mine ? chat.mineMeta : chat.theirsMeta;
    final accent =
        brightness == Brightness.dark ? colors.goldLight : colors.goldDark;
    final sender = m.sender;
    final screenWidth = MediaQuery.sizeOf(context).width;
    final a = m.attachment == null ? null : groupChatAttachment(m.attachment!);
    final withName = !mine && showName && !m.deleted;
    // A photo without a caption: a thin frame with the time on it.
    final media = !m.deleted &&
        a != null &&
        (a.isImage || a.isVideo) &&
        m.body.trim().isEmpty &&
        m.replyTo == null &&
        !withName;

    final timeText = m.editedAt != null && !m.deleted
        ? '${t.t('group.conv.edited')} ${f.time(m.createdAt)}'
        : f.time(m.createdAt);
    final metaRow = Text(
      timeText,
      style: type.caption.copyWith(color: meta),
    );

    Widget body() {
      if (m.deleted) {
        return Text(
          t.t('group.message.deleted'),
          style: type.body.copyWith(
            color: meta,
            fontStyle: FontStyle.italic,
            height: 1.35,
          ),
        );
      }
      if (m.isPoll) {
        return SizedBox(
          width: math.min(screenWidth * 0.72, 340),
          child: PollBubble(
            groupId: groupId,
            message: m,
            canClose: canClose,
            onPollChanged: onPollChanged,
          ),
        );
      }
      if (a != null) {
        return _AttachmentBody(
          message: m,
          attachment: a,
          fg: fg,
          accent: accent,
          onMention: (p) => openGroupPerson(context, ref, p),
        );
      }
      return GroupRichText(
        text: m.body,
        style: type.body.copyWith(color: fg, height: 1.35),
        linkColor: accent,
        mentionColor: accent,
        mentions: m.mentions,
        onMention: (p) => openGroupPerson(context, ref, p),
      );
    }

    final reply = m.replyTo;
    final content = media
        ? Stack(
            children: [
              _AttachmentBody(
                message: m,
                attachment: a,
                fg: fg,
                accent: accent,
                onMention: (_) {},
              ),
              PositionedDirectional(
                end: 6,
                bottom: 6,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: ChatColors.mediaScrim,
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                  ),
                  child: Text(
                    timeText,
                    style:
                        type.caption.copyWith(color: ChatColors.onMediaScrim),
                  ),
                ),
              ),
            ],
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (withName)
                GestureDetector(
                  onTap: sender == null
                      ? null
                      : () => openGroupPerson(context, ref, sender),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      groupPersonName(t, sender),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: groupSenderColor(
                          sender?.userId ?? '',
                          brightness,
                        ),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              if (reply != null && !m.deleted)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: _ReplyBlock(
                    reply: reply,
                    fg: fg,
                    accent: accent,
                    onTap: reply.deleted || onJump == null
                        ? null
                        : () => onJump!(reply.id),
                  ),
                ),
              body(),
              const SizedBox(height: 2),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: metaRow,
              ),
            ],
          );

    final bubble = Container(
      constraints: BoxConstraints(maxWidth: screenWidth * 0.78),
      padding: media
          ? const EdgeInsets.all(3)
          : const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.xs,
            ),
      decoration: BoxDecoration(
        color: mine ? chat.mine : chat.theirs,
        borderRadius: _radius(mine: mine),
        border: m.mentionsMe
            ? Border.all(color: colors.gold.withValues(alpha: 0.7))
            : (mine ? null : Border.all(color: chat.theirsBorder)),
      ),
      child: content,
    );

    final interactive = GestureDetector(
      onLongPress: onMenu,
      onSecondaryTap: onMenu,
      child: Semantics(
        container: true,
        label: groupMessagePreview(t, m, withSender: true),
        onLongPress: onMenu,
        excludeSemantics: a == null && !m.isPoll,
        child: bubble,
      ),
    );

    Widget avatar() {
      final s = sender;
      if (!showAvatar || s == null) return const SizedBox(width: 32);
      return GestureDetector(
        onTap: () => openGroupPerson(context, ref, s),
        child: GoldRingAvatar(
          url: s.avatarUrl,
          initials: avatarInitials(groupPersonName(t, s)),
          size: 32,
          ring: s.verifiedBadge,
        ),
      );
    }

    final row = Row(
      mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (!mine) ...[
          avatar(),
          const SizedBox(width: AppSpacing.xs + 2),
        ],
        Flexible(child: interactive),
      ],
    );

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: EdgeInsets.only(top: showName ? 6 : 1.5, bottom: 1.5),
      color: highlighted ? colors.gold.withValues(alpha: 0.16) : null,
      child: onReply == null || m.deleted
          ? row
          : GroupSwipeToReply(
              onReply: onReply!,
              semanticLabel: t.t('group.conv.reply'),
              child: row,
            ),
    );
  }
}

/// The quoted message above a reply.
class _ReplyBlock extends StatelessWidget {
  const _ReplyBlock({
    required this.reply,
    required this.fg,
    required this.accent,
    required this.onTap,
  });

  final api.GroupReplyPreviewDto reply;
  final Color fg;
  final Color accent;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Consumer(
        builder: (context, ref, _) {
          final t = ref.watch(translatorProvider);
          final type = Theme.of(context).extension<AppTypographyTokens>()!;
          final name = reply.senderName?.trim();
          return AppPressable(
            onTap: onTap,
            child: Container(
              padding: const EdgeInsetsDirectional.only(
                start: AppSpacing.sm,
                end: AppSpacing.sm,
                top: 3,
                bottom: 3,
              ),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(6),
                border: BorderDirectional(
                  start: BorderSide(color: accent, width: 3),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    name == null || name.isEmpty ? t.t('group.someone') : name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    reply.deleted
                        ? t.t('group.message.deleted')
                        : reply.snippet,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(
                      color: fg.withValues(alpha: 0.85),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      );
}

/// A photo (tap: full screen), a video or a document, with its caption.
class _AttachmentBody extends ConsumerWidget {
  const _AttachmentBody({
    required this.message,
    required this.attachment,
    required this.fg,
    required this.accent,
    required this.onMention,
  });

  final api.GroupMessageDto message;
  final ChatAttachment attachment;
  final Color fg;
  final Color accent;
  final void Function(api.GroupPersonDto person) onMention;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = attachment;
    var captionWidth = 240.0;
    final Widget content;
    if (a.isVideo) {
      final box = chatMediaBox(context, a);
      content = ChatVideoTile(
        attachment: a,
        sending: false,
        playLabel: t.t('chat.attach.videoPlay'),
        box: box,
      );
      captionWidth = box.width;
    } else if (a.isImage) {
      final box = chatMediaBox(context, a);
      captionWidth = box.width;
      content = Semantics(
        button: a.url != null,
        image: true,
        label: t.t('chat.attach.photo'),
        child: AppPressable(
          onTap: a.url == null
              ? () {}
              : () => showPhotoGallery(
                    context,
                    urls: [a.url!],
                    closeLabel: t.t('common.close'),
                  ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox.fromSize(
              size: box,
              child: ChatPhoto(attachment: a, size: box),
            ),
          ),
        ),
      );
    } else {
      content = ChatDocumentRow(attachment: a, fg: fg);
    }
    final caption = message.body;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        content,
        if (caption.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          SizedBox(
            width: captionWidth,
            child: GroupRichText(
              text: caption,
              style: type.body.copyWith(color: fg, height: 1.35),
              linkColor: accent,
              mentionColor: accent,
              mentions: message.mentions,
              onMention: onMention,
            ),
          ),
        ],
      ],
    );
  }
}

/// A message of mine the server has not confirmed yet (or that failed).
class GroupPendingBubble extends ConsumerWidget {
  const GroupPendingBubble({
    required this.pending,
    required this.onRetry,
    required this.onDiscard,
    super.key,
  });

  final PendingGroupMessage pending;
  final VoidCallback onRetry;
  final VoidCallback onDiscard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final p = pending;
    final file = p.fileName;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1.5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.78,
            ),
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              AppSpacing.sm,
              AppSpacing.md,
              AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: chat.mine,
              borderRadius: _radius(mine: true),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (file != null)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AppIcon(
                        AppIcons.insertDriveFileRounded,
                        size: 20,
                        color: chat.onMine,
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Flexible(
                        child: Text(
                          file,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall.copyWith(
                            color: chat.onMine,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                if (p.body.isNotEmpty)
                  Text(
                    p.body,
                    style: type.body.copyWith(color: chat.onMine, height: 1.35),
                  ),
                const SizedBox(height: 2),
                Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: AppIcon(
                    p.failed
                        ? AppIcons.errorOutlineRounded
                        : AppIcons.scheduleRounded,
                    size: 15,
                    color: p.failed ? colors.danger : chat.mineMeta,
                    semanticLabel: p.failed
                        ? t.t('chat.notSent')
                        : t.t('chat.state.sending'),
                  ),
                ),
              ],
            ),
          ),
          if (p.failed)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: FitText(
                    t.t('chat.notSent'),
                    style: type.caption.copyWith(color: colors.danger),
                  ),
                ),
                if (file == null)
                  Flexible(
                    child: TextButton(
                      onPressed: onRetry,
                      child: FitText(t.t('error.retry')),
                    ),
                  ),
                Flexible(
                  child: TextButton(
                    onPressed: onDiscard,
                    child: FitText(t.t('chat.discard')),
                  ),
                ),
              ],
            ),
        ],
      ),
    );
  }
}
