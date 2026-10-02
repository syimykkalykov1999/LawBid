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

/// Bulk actions on the picked chats: pin · move · mute · delete (from my
/// list only — the history stays with the other side and comes back with
/// a new message).
class ChatSelectionBar extends ConsumerStatefulWidget {
  const ChatSelectionBar({required this.chats, super.key});

  /// The chats of the visible folder (to find the picked ones).
  final List<Conversation> chats;

  @override
  ConsumerState<ChatSelectionBar> createState() => _ChatSelectionBarState();
}

class _ChatSelectionBarState extends ConsumerState<ChatSelectionBar> {
  bool _busy = false;

  List<Conversation> get _picked {
    final ids = ref.read(chatSelectionProvider) ?? const <String>{};
    return widget.chats.where((c) => ids.contains(c.id)).toList();
  }

  Future<void> _each(
    Future<void> Function(Conversation c) call, {
    required String done,
  }) async {
    final t = ref.read(translatorProvider);
    final picked = _picked;
    if (picked.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      for (final c in picked) {
        await call(c);
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
    final pin = picked.any((c) => !c.pinned);
    return _each(
      (c) => ref.read(chatRepositoryProvider).organize(c.id, pinned: pin),
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
              icon: AppIcons.inboxOutlined,
              label: t.t('chat.folder.general'),
              onTap: () => Navigator.of(ctx).pop(ChatListFolder.general),
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
            folder: target == ChatListFolder.waiting
                ? null
                : target == ChatListFolder.primary
                    ? ChatFolder.primary
                    : ChatFolder.general,
            waiting: target == ChatListFolder.waiting,
          ),
      done: 'chat.organize.moved',
    );
  }

  Future<void> _mute() {
    final unmute = _picked.every((c) => c.muted);
    return _each(
      (c) => ref.read(chatRepositoryProvider).mute(
            c.id,
            unmute ? null : DateTime.now().add(const Duration(days: 3650)),
          ),
      done: unmute ? 'chat.select.unmuted' : 'chat.select.muted',
    );
  }

  Future<void> _delete() async {
    final t = ref.read(translatorProvider);
    final n = _picked.length;
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('chat.select.deleteTitle', {'count': '$n'}),
      message: t.t('chat.select.deleteMessage'),
      confirmLabel: t.t('chat.select.delete'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    await _each(
      (c) => ref.read(chatRepositoryProvider).organize(c.id, hidden: true),
      done: 'chat.select.deleted',
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ids = ref.watch(chatSelectionProvider) ?? const <String>{};
    final enabled = ids.isNotEmpty && !_busy;

    Widget action(
      String keyName,
      IconData icon,
      String label,
      VoidCallback onTap, {
      bool danger = false,
    }) {
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
            ),
            action(
              'select-mute',
              AppIcons.notificationsOffOutlined,
              t.t('chat.select.mute'),
              _mute,
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
