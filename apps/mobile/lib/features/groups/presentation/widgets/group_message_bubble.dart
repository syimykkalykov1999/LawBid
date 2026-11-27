import 'dart:math' as math;

import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/platform/web_context_menu.dart';
import 'package:lawbid/features/chat/application/link_preview_providers.dart'
    show firstUrlIn;
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show AttachmentMessageBody, ChatRemovedFileRow;
import 'package:lawbid/features/chat/presentation/chat_album.dart';
import 'package:lawbid/features/chat/presentation/chat_post_card.dart'
    show PostLinkCard, lawbidLinkHost, lawbidPostIdIn;
import 'package:lawbid/features/chat/presentation/chat_video.dart';
import 'package:lawbid/features/chat/presentation/link_preview_card.dart';
import 'package:lawbid/features/chat/presentation/message_actions.dart'
    show ReactionChipRow;
import 'package:lawbid/features/chat/presentation/reply_swipe.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/groups/domain/slow_mode.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_service.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_bubble.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_rich_text.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_style.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show GoldRingAvatar;
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart'
    show openProfile;
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';

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
    this.selected = false,
    this.onTap,
    this.protectContent = false,
    this.onReact,
    this.voiceThread,
    super.key,
  });

  final api.GroupMessageDto message;
  final String groupId;

  /// Groups WhatsApp parity: the group's notes for the 1:1 voice bubble
  /// (the ones after a note play by themselves).
  final VoiceThread? voiceThread;

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

  /// Owner 2026-10-21 (Telegram): picked in «Select» mode (tinted); a tap
  /// then calls [onTap] (pick / unpick).
  final bool selected;
  final VoidCallback? onTap;

  /// The group restricts saving content: a file is not opened outside the
  /// app.
  final bool protectContent;

  /// Groups WhatsApp parity: a tap on a reaction chip (the 1:1 chips):
  /// mine → null (taken away), another → that emoji. Null: no chips taps.
  final ValueChanged<String?>? onReact;

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
        !a.removed &&
        (a.isImage || a.isVideo) &&
        m.body.trim().isEmpty &&
        m.replyTo == null &&
        !(m.forwarded ?? false) &&
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
          protectContent: protectContent,
          onMention: (p) => openGroupPerson(context, ref, p),
        );
      }
      final voice = m.voiceMessage;
      if (voice != null) {
        // Groups WhatsApp parity: the 1:1 voice bubble (sender's photo with
        // the mic badge, bars, speed, the one app player).
        final me = mine ? ref.watch(currentUserControllerProvider).user : null;
        return VoiceMessageBody(
          message: voice,
          mine: mine,
          threadId: groupVoiceThreadId(groupId),
          thread: voiceThread ??
              VoiceThread(messages: () => [voice], played: (_) async {}),
          avatarUrl: mine ? me?.avatarUrl : sender?.avatarUrl,
          avatarName: mine
              ? [me?.firstName, me?.lastName]
                  .whereType<String>()
                  .where((x) => x.trim().isNotEmpty)
                  .join(' ')
              : groupPersonName(t, sender),
        );
      }
      if (m.body.isEmpty && GroupE2eeService.isWaiting(m.id)) {
        // G2 (WhatsApp «Ожидание сообщения»): this device could not open
        // it (yet); the chats' line and lock.
        return Text.rich(
          TextSpan(
            children: [
              WidgetSpan(
                alignment: PlaceholderAlignment.middle,
                child: Icon(AppIcons.lockOutlineRounded, size: 14, color: fg),
              ),
              TextSpan(text: ' ${t.t('chat.e2ee.waiting')}'),
            ],
          ),
          style: type.body.copyWith(
            color: fg,
            fontStyle: FontStyle.italic,
            height: 1.35,
          ),
        );
      }
      final text = GroupRichText(
        text: m.body,
        style: type.body.copyWith(color: fg, height: 1.35),
        linkColor: accent,
        mentionColor: accent,
        mentions: m.mentions,
        onMention: (p) => openGroupPerson(context, ref, p),
      );
      // Owner 26.11 (the 1:1 chat, Instagram): a link gets its card under
      // the text — a LawBid post the 1:1 chat's post card, any other link
      // the 1:1 chat's site card (groups are not end-to-end encrypted, so
      // the server may read the site, as for a 1:1 chat that is not).
      final url = firstUrlIn(m.body);
      if (url == null) return text;
      final postId = lawbidPostIdIn(m.body, host: lawbidLinkHost(ref));
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          text,
          if (postId != null)
            PostLinkCard(postId: postId, mine: mine)
          else
            LinkPreviewCard(url: url, mine: mine, conversationId: groupId),
        ],
      );
    }

    final reply = m.replyTo;
    // Owner 2026-10-21 (Telegram): «Forwarded from <name>».
    final forwarded = (m.forwarded ?? false) && !m.deleted;
    final from = m.forwardedFrom?.trim();
    final content = media
        ? Stack(
            children: [
              _AttachmentBody(
                message: m,
                attachment: a,
                fg: fg,
                accent: accent,
                protectContent: protectContent,
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
              if (forwarded)
                Padding(
                  key: const ValueKey('group-forwarded'),
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AppIcon(AppIcons.forwardRounded, size: 13, color: meta),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          from == null || from.isEmpty
                              ? t.t('chat.forwarded')
                              : t.t('chat.forwardedFrom', {'name': from}),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(
                            color: meta,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ),
                    ],
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

    // Owner row 113: the right-click (website) opens the same menu, and the
    // browser's own menu stays closed over the bubble.
    final interactive = WebRightClickMenu(
      onMenu: onMenu,
      child: GestureDetector(
        onTap: onTap,
        onLongPress: onMenu,
        onSecondaryTap: onMenu,
        child: Semantics(
          container: true,
          label: groupMessagePreview(t, m, withSender: true),
          onLongPress: onMenu,
          // Voice bubbles keep their play / speed buttons reachable (1:1).
          excludeSemantics: a == null && !m.isPoll && !m.isVoice,
          child: bubble,
        ),
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

    final chips = m.reactionChips;
    final row = Row(
      mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (!mine) ...[
          avatar(),
          const SizedBox(width: AppSpacing.xs + 2),
        ],
        Flexible(
          child: chips.isEmpty
              ? interactive
              : Column(
                  crossAxisAlignment:
                      mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    interactive,
                    ReactionChipRow(
                      reactions: chips,
                      alignEnd: mine,
                      onTap: (r) => onReact?.call(r.mine ? null : r.emoji),
                    ),
                  ],
                ),
        ),
      ],
    );

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      padding: EdgeInsets.only(top: showName ? 6 : 1.5, bottom: 1.5),
      color: selected
          ? colors.iconTint.withValues(alpha: 0.14)
          : highlighted
              ? colors.gold.withValues(alpha: 0.16)
              : null,
      child: onReply == null || m.deleted
          ? row
          : Semantics(
              // Screen readers: the reply is an action, not only a drag.
              customSemanticsActions: {
                CustomSemanticsAction(label: t.t('group.conv.reply')): onReply!,
              },
              child: SwipeToReply(
                onReply: onReply!,
                child: row,
              ),
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
    this.protectContent = false,
  });

  final api.GroupMessageDto message;
  final ChatAttachment attachment;
  final Color fg;
  final Color accent;
  final void Function(api.GroupPersonDto person) onMention;
  final bool protectContent;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = attachment;
    var captionWidth = 240.0;
    final Widget content;
    if (a.removed) {
      content = ChatRemovedFileRow(fg: fg);
    } else if (a.isVideo) {
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
      content = ChatDocumentRow(
        attachment: a,
        fg: fg,
        // Owner 2026-10-21: opening it outside the app would save it.
        onOpen: protectContent
            ? () => showAppSnackBar(context, t.t('chat.forward.protected'))
            : null,
      );
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
    this.groupId = '',
    this.startsRun = false,
    this.replyTo,
    super.key,
  });

  /// Owner 27.11: the quote of the message this one answers, drawn as the
  /// delivered bubble draws it (null: not a reply, or not loaded).
  final api.GroupReplyPreviewDto? replyTo;

  final PendingGroupMessage pending;

  /// Owner 27.11 (no jump when the server's copy takes its place): the
  /// first of my run after someone else's message — the delivered bubble
  /// then keeps the same 6 dp above it ([GroupMessageBubble.showName]).
  final bool startsRun;

  /// The group (the mini-player's way back while a note plays).
  final String groupId;
  final VoidCallback onRetry;
  final VoidCallback onDiscard;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    // The width the delivered bubble's time takes, from the platform's own
    // time format (no app date data needed: a failed bubble with «Retry»
    // must always draw — CI #1394, KNOWN_ERRORS 275).
    final timeSlot = MaterialLocalizations.of(context).formatTimeOfDay(
      TimeOfDay.now(),
      alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
    );
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final p = pending;
    final file = p.fileName;
    // Owner 26.11 (WhatsApp / the 1:1 chat): a queued photo or video shows
    // at once as itself — its picture from the phone, the ring while its
    // bytes go up (a tap on the ring stops it) — not as a file name.
    final media = p.attachment;
    // Owner 27.11 («фото на миг огромные и потом меняются»): a photo or
    // video without a caption sits in the same thin frame, with its state
    // on the picture, as the delivered one (GroupMessageBubble `media`), so
    // the bubble keeps its size when the server's copy takes its place.
    final framed = media != null &&
        (media.isImage || media.isVideo) &&
        !media.removed &&
        p.body.trim().isEmpty &&
        p.replyToId == null;
    final stateIcon = AppIcon(
      p.failed ? AppIcons.errorOutlineRounded : AppIcons.scheduleRounded,
      size: 15,
      color: p.failed
          ? colors.danger
          : (framed ? ChatColors.onMediaScrim : chat.mineMeta),
      semanticLabel: p.failed ? t.t('chat.notSent') : t.t('chat.state.sending'),
    );
    return Padding(
      padding: EdgeInsets.only(top: startsRun ? 6 : 1.5, bottom: 1.5),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.sizeOf(context).width * 0.78,
            ),
            padding: framed
                ? const EdgeInsets.all(3)
                : const EdgeInsets.fromLTRB(
                    AppSpacing.md,
                    AppSpacing.sm,
                    AppSpacing.md,
                    AppSpacing.xs,
                  ),
            decoration: BoxDecoration(
              color: chat.mine,
              borderRadius: _radius(mine: true),
            ),
            child: framed
                ? Stack(
                    children: [
                      AttachmentMessageBody(
                        message: ChatMessage(
                          id: 'local:${p.clientMessageId}',
                          conversationId: groupId,
                          kind: MessageKind.attachment,
                          body: '',
                          clientMessageId: p.clientMessageId,
                          createdAt: DateTime.now(),
                          delivery: p.failed
                              ? DeliveryState.failed
                              : DeliveryState.sending,
                          attachment: media,
                        ),
                        mine: true,
                        onCancel: onDiscard,
                      ),
                      PositionedDirectional(
                        end: 6,
                        bottom: 6,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: ChatColors.mediaScrim,
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                          child: stateIcon,
                        ),
                      ),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (replyTo != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: _ReplyBlock(
                            reply: replyTo!,
                            fg: chat.onMine,
                            accent:
                                Theme.of(context).brightness == Brightness.dark
                                    ? colors.goldLight
                                    : colors.goldDark,
                            onTap: null,
                          ),
                        ),
                      // Groups WhatsApp parity: my note plays from the
                      // recording while it is being sent (the 1:1 local
                      // bubble).
                      if (p.voice != null)
                        VoiceMessageBody(
                          message: ChatMessage(
                            id: 'local:${p.clientMessageId}',
                            conversationId: groupId,
                            kind: MessageKind.voice,
                            body: '',
                            clientMessageId: p.clientMessageId,
                            createdAt: DateTime.now(),
                            voice: p.voice,
                          ),
                          mine: true,
                          threadId: groupVoiceThreadId(groupId),
                          thread: VoiceThread(
                            messages: () => const [],
                            played: (_) async {},
                          ),
                          avatarUrl: ref
                              .watch(currentUserControllerProvider)
                              .user
                              ?.avatarUrl,
                        ),
                      if (media != null)
                        AttachmentMessageBody(
                          message: ChatMessage(
                            id: 'local:${p.clientMessageId}',
                            conversationId: groupId,
                            kind: MessageKind.attachment,
                            body: p.body,
                            clientMessageId: p.clientMessageId,
                            createdAt: DateTime.now(),
                            delivery: p.failed
                                ? DeliveryState.failed
                                : DeliveryState.sending,
                            attachment: media,
                          ),
                          mine: true,
                          onCancel: onDiscard,
                        )
                      else if (file != null)
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
                      if (p.body.isNotEmpty && media == null)
                        Text(
                          p.body,
                          style: type.body.copyWith(
                            color: chat.onMine,
                            height: 1.35,
                          ),
                        ),
                      // Owner 27.11: the link's card is there while it is
                      // sent too (the delivered bubble's own card, same size).
                      if (media == null && p.voice == null)
                        if (firstUrlIn(p.body) case final url?)
                          if (lawbidPostIdIn(p.body, host: lawbidLinkHost(ref))
                              case final postId?)
                            PostLinkCard(postId: postId, mine: true)
                          else
                            LinkPreviewCard(
                              url: url,
                              mine: true,
                              conversationId: groupId,
                            ),
                      const SizedBox(height: 2),
                      // Owner 27.11: the clock takes the slot of the time the
                      // delivered bubble shows there (same height and width),
                      // so the bubble does not move when it is confirmed.
                      Align(
                        alignment: AlignmentDirectional.centerEnd,
                        child: Stack(
                          alignment: AlignmentDirectional.centerEnd,
                          children: [
                            ExcludeSemantics(
                              child: Opacity(
                                opacity: 0,
                                child: Text(
                                  timeSlot,
                                  style: type.caption,
                                ),
                              ),
                            ),
                            stateIcon,
                          ],
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
                    p.slowWaitS == null
                        ? t.t('chat.notSent')
                        : t.t('group.slow.wait', {
                            'time': slowModeLabel(t, p.slowWaitS!),
                          }),
                    style: type.caption.copyWith(color: colors.dangerText),
                  ),
                ),
                // Audit 26.10 B9: a file is sent again too (1:1 chats).
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

/// Owner 27.11: the quote a pending reply shows — built from the answered
/// message on the phone exactly as the server builds it
/// (group-presenter.service.ts: the poll question, else the text, else the
/// file name, at most 100 characters).
api.GroupReplyPreviewDto groupReplyPreviewOf(api.GroupMessageDto m) {
  final text = m.isPoll
      ? (m.poll?.question ?? '')
      : (m.body.isNotEmpty ? m.body : (m.attachment?.name ?? ''));
  return api.GroupReplyPreviewDto(
    id: m.id,
    type: api.GroupReplyPreviewDtoType.fromJson(m.type.json ?? 'text'),
    senderName: m.sender?.displayName,
    deleted: m.deleted,
    snippet: m.deleted ? '' : text.characters.take(100).toString(),
  );
}
