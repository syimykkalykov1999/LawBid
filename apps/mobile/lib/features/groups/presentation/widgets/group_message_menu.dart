import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/presentation/message_actions.dart'
    show MessageReactionButton, kQuickReactions;
import 'package:lawbid/features/chat/presentation/message_context_menu.dart'
    show MessageReactionBar;

/// What the long-press menu of a message can do. Owner 2026-10-21
/// (Telegram): forward, select, and — in a group that restricts saving
/// content — share the group's link instead.
enum GroupMessageAction {
  reply,
  copy,
  forward,
  shareLink,
  select,
  edit,
  pin,
  unpin,
  delete,
}

/// The long-press / right-click menu of a message; resolves to the chosen
/// action, or null when dismissed. Rows that do not apply are left out.
///
/// Groups WhatsApp parity: with [onReact] the 1:1 chat's quick reactions
/// lead the sheet ([kQuickReactions], [myReaction] marked); a tap closes
/// the sheet and hands the emoji over.
Future<GroupMessageAction?> showGroupMessageMenu(
  BuildContext context,
  Translator t, {
  required bool canReply,
  required bool canCopy,
  required bool canEdit,
  required bool canPin,
  required bool pinned,
  required bool canDelete,
  bool canForward = false,
  bool canShareLink = false,
  bool canSelect = false,
  String? myReaction,
  ValueChanged<String>? onReact,
}) =>
    showAppBottomSheet<GroupMessageAction>(
      context: context,
      builder: (sheet) {
        Widget row(
          GroupMessageAction action,
          IconData icon,
          String key, {
          bool destructive = false,
        }) =>
            AppListRow(
              icon: icon,
              label: t.t(key),
              showChevron: false,
              destructive: destructive,
              onTap: () => Navigator.of(sheet).pop(action),
            );
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              if (onReact != null)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.sm,
                  ),
                  child: MessageReactionBar(
                    children: [
                      for (final e in kQuickReactions)
                        MessageReactionButton(
                          key: ValueKey('group-react-$e'),
                          emoji: e,
                          selected: e == myReaction,
                          onTap: () {
                            Navigator.of(sheet).pop();
                            onReact(e);
                          },
                        ),
                    ],
                  ),
                ),
              if (canReply)
                row(
                  GroupMessageAction.reply,
                  AppIcons.replyRounded,
                  'group.conv.reply',
                ),
              if (canCopy)
                row(
                  GroupMessageAction.copy,
                  AppIcons.articleOutlined,
                  'group.conv.copy',
                ),
              if (canForward)
                row(
                  GroupMessageAction.forward,
                  AppIcons.forwardRounded,
                  'chat.act.forward',
                ),
              if (canShareLink)
                row(
                  GroupMessageAction.shareLink,
                  AppIcons.linkRounded,
                  'chat.forward.shareLink',
                ),
              if (canEdit)
                row(
                  GroupMessageAction.edit,
                  AppIcons.editOutlined,
                  'group.conv.edit',
                ),
              if (canPin)
                row(
                  pinned ? GroupMessageAction.unpin : GroupMessageAction.pin,
                  AppIcons.pushPinOutlined,
                  pinned ? 'group.conv.unpin' : 'group.conv.pin',
                ),
              if (canSelect)
                row(
                  GroupMessageAction.select,
                  AppIcons.selectChecksRounded,
                  'chat.act.select',
                ),
              if (canDelete)
                row(
                  GroupMessageAction.delete,
                  AppIcons.deleteOutlineRounded,
                  'group.conv.deleteForAll',
                  destructive: true,
                ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        );
      },
    );
