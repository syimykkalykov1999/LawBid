import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/shared/presentation/reaction_sheets.dart';

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
  List<String> reactions = const [],
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
              // Owner 2026-10-21 (inbox 26c, Telegram): the reactions the
              // group opened, on top; a tap puts (or takes back) mine.
              if (onReact != null && reactions.isNotEmpty)
                ReactionQuickBar(
                  key: const ValueKey('group-react-bar'),
                  choices: reactions,
                  mine: myReaction,
                  keyPrefix: 'group-react',
                  label: (e) => t.t('channel.react.pick', {'emoji': e}),
                  onPick: (e) {
                    Navigator.of(sheet).pop();
                    onReact(e);
                  },
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
