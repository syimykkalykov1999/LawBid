import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_saved_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// Owner 2026-10-20: a long press on a message opens its menu — «Copy» and
/// «Save» / «Remove from saved» (WhatsApp's starred messages, Telegram's
/// Saved Messages). Other actions add their rows here.
///
/// [messages] are the messages the bubble stands for (an album is several).
/// A message still being sent or failed has no menu.
class MessageMenuTarget extends ConsumerWidget {
  const MessageMenuTarget({
    required this.messages,
    required this.child,
    super.key,
  });

  final List<ChatMessage> messages;
  final Widget child;

  static bool _sent(ChatMessage m) => !m.id.startsWith('local:');

  /// What «Copy» puts on the clipboard; null = nothing to copy.
  static String? copyText(ChatMessage m) {
    if (m.kind != MessageKind.text && m.kind != MessageKind.place) {
      return m.kind == MessageKind.attachment && m.body.trim().isNotEmpty
          ? m.body
          : null;
    }
    return m.body.trim().isEmpty ? null : m.body;
  }

  /// Whether the message can be saved at all (the server refuses system
  /// lines, calls and stickers).
  static bool savable(ChatMessage m) =>
      _sent(m) &&
      switch (m.kind) {
        MessageKind.text => m.body.trim().isNotEmpty,
        MessageKind.voice ||
        MessageKind.attachment ||
        MessageKind.contact ||
        MessageKind.place =>
          true,
        MessageKind.system ||
        MessageKind.call ||
        MessageKind.sticker ||
        MessageKind.gift ||
        MessageKind.post =>
          false,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (messages.isEmpty || !messages.every(_sent)) return child;
    return GestureDetector(
      behavior: HitTestBehavior.deferToChild,
      onLongPress: () {
        unawaited(HapticFeedback.selectionClick());
        unawaited(_open(context, ref));
      },
      child: child,
    );
  }

  Future<void> _open(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final copy = messages.map(copyText).whereType<String>().join('\n');
    final savable = messages.where(MessageMenuTarget.savable).toList();
    final ids = ref.read(savedChatIdsProvider).value ?? const <String>{};
    final saved =
        savable.isNotEmpty && savable.every((m) => ids.contains(m.id));
    if (copy.isEmpty && savable.isEmpty) return;
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (copy.isNotEmpty)
              AppListRow(
                icon: AppIcons.descriptionOutlined,
                label: t.t('share.copy'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop('copy'),
              ),
            if (savable.isNotEmpty)
              AppListRow(
                icon: saved
                    ? AppIcons.bookmarkRounded
                    : AppIcons.bookmarkBorderRounded,
                label: t.t(saved ? 'saved.remove' : 'common.save'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop('save'),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (choice == null || !context.mounted) return;
    if (choice == 'copy') {
      await Clipboard.setData(ClipboardData(text: copy));
      if (context.mounted) showAppSnackBar(context, t.t('saved.copied'));
      return;
    }
    final notifier = ref.read(savedChatIdsProvider.notifier);
    try {
      for (final m in savable) {
        if (notifier.isSaved(m.id) == saved) await notifier.toggle(m.id);
      }
      if (context.mounted) {
        showAppSnackBar(
          context,
          t.t(saved ? 'saved.removed' : 'cases.saved.added'),
        );
      }
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }
}
