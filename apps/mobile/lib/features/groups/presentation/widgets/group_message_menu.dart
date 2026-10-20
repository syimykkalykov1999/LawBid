import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// What the long-press menu of a message can do.
enum GroupMessageAction { reply, copy, edit, pin, unpin, delete }

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
