import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Bulk actions on the picked chats: pin · move · mute · delete (from my
/// list only — the history stays with the other side and comes back with
/// a new message). Picked groups take part in pin · mute · delete (hide);
/// «Move» (folders) is off while a group is picked.
class ChatSelectionBar extends ConsumerStatefulWidget {
  const ChatSelectionBar({
    required this.chats,
    this.groups = const [],
    this.inArchive = false,
    super.key,
  });

  /// The chats of the visible folder (to find the picked ones).
  final List<Conversation> chats;

  /// The groups of the visible list.
  final List<api.GroupDto> groups;

  /// On the Archive screen the action is «Unarchive».
  final bool inArchive;

  @override
  ConsumerState<ChatSelectionBar> createState() => _ChatSelectionBarState();
}

class _ChatSelectionBarState extends ConsumerState<ChatSelectionBar> {
  bool _busy = false;

  List<Conversation> get _picked {
    final ids = ref.read(chatSelectionProvider) ?? const <String>{};
    return widget.chats.where((c) => ids.contains(c.id)).toList();
  }

  List<api.GroupDto> get _pickedGroups {
    final ids = ref.read(chatSelectionProvider) ?? const <String>{};
    return widget.groups.where((g) => ids.contains(g.id)).toList();
  }

  Future<void> _each(
    Future<void> Function(Conversation c) call, {
    required String done,
    Future<void> Function(api.GroupDto g)? groupCall,
  }) async {
    final t = ref.read(translatorProvider);
    final picked = _picked;
    final groups = groupCall == null ? const <api.GroupDto>[] : _pickedGroups;
    if ((picked.isEmpty && groups.isEmpty) || _busy) return;
    setState(() => _busy = true);
    try {
      for (final c in picked) {
        await call(c);
      }
      for (final g in groups) {
        await groupCall!(g);
      }
      refreshChatFolders(ref);
      ref.read(chatSelectionProvider.notifier).stop();
      if (mounted) showAppSnackBar(context, t.t(done));
    } on Object catch (e) {
      refreshChatFolders(ref);
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pin() {
    final picked = _picked;
    // All pinned → unpin them; otherwise pin them all.
    final pin =
        picked.any((c) => !c.pinned) || _pickedGroups.any((g) => !g.pinned);
    return _each(
      (c) => ref.read(chatRepositoryProvider).organize(c.id, pinned: pin),
      groupCall: (g) => updateMyGroup(ref, g.id, pinned: pin),
      done: pin ? 'chat.organize.pinned' : 'chat.organize.unpinned',
    );
  }

  Future<void> _move() async {
    final t = ref.read(translatorProvider);
    final target = await showAppBottomSheet<ChatListFolder>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpacing.sm),
            const AppSheetHandle(),
            AppListRow(
              icon: AppIcons.starOutlineRounded,
              label: t.t('chat.folder.primary'),
              onTap: () => Navigator.of(ctx).pop(ChatListFolder.primary),
            ),
            AppListRow(
              icon: AppIcons.hourglassEmptyRounded,
              label: t.t('chat.folder.waiting'),
              onTap: () => Navigator.of(ctx).pop(ChatListFolder.waiting),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (target == null || !mounted) return;
    // Waiting is a mark ("waiting for my answer"); Primary / General move the
    // chat there and take the mark off.
    await _each(
      (c) => ref.read(chatRepositoryProvider).organize(
            c.id,
            folder:
                target == ChatListFolder.waiting ? null : ChatFolder.primary,
            waiting: target == ChatListFolder.waiting,
          ),
      done: 'chat.organize.moved',
    );
  }

  Future<void> _mute() {
    final unmute =
        _picked.every((c) => c.muted) && _pickedGroups.every(isGroupMuted);
    return _each(
      (c) => ref.read(chatRepositoryProvider).mute(
            c.id,
            unmute ? null : DateTime.now().add(const Duration(days: 3650)),
          ),
      groupCall: (g) => updateMyGroup(ref, g.id, muted: !unmute),
      done: unmute ? 'chat.select.unmuted' : 'chat.select.muted',
    );
  }

  /// Owner 2026-10-20 (Telegram): chats and groups to the Archive (or back).
  Future<void> _archive() => _each(
        (c) => ref
            .read(chatRepositoryProvider)
            .organize(c.id, archived: !widget.inArchive),
        groupCall: (g) => updateMyGroup(ref, g.id, archived: !widget.inArchive),
        done: widget.inArchive ? 'chat.unarchive' : 'tasks.bulk.archive',
      );

  /// Owner 2026-10-20: «mark read» for the chats picked (groups keep their own
  /// read marks).
  Future<void> _readAll() => _each(
        (c) async {
          final last = c.lastMessage;
          if (c.unreadCount > 0 && last != null) {
            await ref.read(chatRepositoryProvider).read(c.id, last.id);
          }
        },
        done: 'notif.markAllRead',
      );

  Future<void> _delete() async {
    final t = ref.read(translatorProvider);
    final n = _picked.length + _pickedGroups.length;
    final withGroups = _pickedGroups.isNotEmpty;
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('chat.select.deleteTitle', {'count': '$n'}),
      message: t.t(
        withGroups ? 'group.select.hideMessage' : 'chat.select.deleteMessage',
      ),
      confirmLabel: t.t('chat.select.delete'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _each(
      (c) => ref.read(chatRepositoryProvider).organize(c.id, hidden: true),
      groupCall: (g) => updateMyGroup(ref, g.id, hidden: true),
      done: 'chat.select.deleted',
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ids = ref.watch(chatSelectionProvider) ?? const <String>{};
    final active = ids.isNotEmpty && !_busy;
    // Folders do not exist for groups.
    final moveEnabled = !widget.groups.any((g) => ids.contains(g.id));

    Widget action(
      String keyName,
      IconData icon,
      String label,
      VoidCallback onTap, {
      bool danger = false,
      bool available = true,
    }) {
      final enabled = active && available;
      final color = !enabled
          ? colors.textSecondary.withValues(alpha: 0.5)
          : danger
              ? colors.dangerText
              : colors.text;
      return Expanded(
        child: Semantics(
          button: true,
          enabled: enabled,
          label: label,
          excludeSemantics: true,
          child: AppPressable(
            key: ValueKey(keyName),
            onTap: enabled ? onTap : null,
            child: SizedBox(
              height: 56,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AppIcon(icon, color: color),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: color),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Material(
      color: colors.surface,
      elevation: 8,
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            action(
              'select-pin',
              AppIcons.pushPinOutlined,
              t.t('chat.select.pin'),
              _pin,
            ),
            action(
              'select-move',
              AppIcons.folderOpenRounded,
              t.t('chat.select.move'),
              _move,
              available: moveEnabled,
            ),
            action(
              'select-mute',
              AppIcons.notificationsOffOutlined,
              t.t('chat.select.mute'),
              _mute,
            ),
            action(
              'select-read',
              AppIcons.doneAllRounded,
              t.t('notif.markAllRead'),
              _readAll,
            ),
            action(
              'select-archive',
              widget.inArchive
                  ? AppIcons.unarchiveOutlined
                  : AppIcons.inventory2Outlined,
              t.t(widget.inArchive ? 'chat.unarchive' : 'tasks.bulk.archive'),
              _archive,
            ),
            action(
              'select-delete',
              AppIcons.deleteOutlineRounded,
              t.t('chat.select.delete'),
              _delete,
              danger: true,
            ),
          ],
        ),
      ),
    );
  }
}
