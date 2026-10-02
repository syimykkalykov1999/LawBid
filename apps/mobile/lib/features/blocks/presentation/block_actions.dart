import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Block / unblock [userId] with a confirmation for blocking (owner
/// 2026-09-29, OQ-028). Returns true when the state changed. Callers
/// refresh the profile they show (its `isBlocked` flag).
Future<bool> toggleBlock(
  BuildContext context,
  WidgetRef ref, {
  required String userId,
  required String displayName,
  required bool currentlyBlocked,
}) async {
  final t = ref.read(translatorProvider);
  if (!currentlyBlocked) {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(t.t('block.confirm.title', {'name': displayName})),
        content: Text(t.t('block.confirm.body')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(t.t('block.action')),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return false;
  }
  try {
    final repo = ref.read(blocksRepositoryProvider);
    if (currentlyBlocked) {
      await repo.unblock(userId);
    } else {
      await repo.block(userId);
    }
    ref.invalidate(blockedUsersProvider);
    // Audit 2026-10-02: everything that hides blocked people refreshes now
    // (feed, chats, open chat, suggestions), not on the next pull.
    ref
      ..invalidate(blockedIdsProvider)
      ..invalidate(feedProvider)
      ..invalidate(conversationsProvider)
      ..invalidate(folderConversationsProvider)
      ..invalidate(suggestionsProvider);
    if (context.mounted) {
      showAppSnackBar(
        context,
        t.t(currentlyBlocked ? 'block.undone' : 'block.done'),
      );
    }
    return true;
  } catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
    return false;
  }
}

/// The "Block" / "Unblock" row for a "⋯" sheet.
class BlockListRow extends ConsumerWidget {
  const BlockListRow({
    required this.userId,
    required this.displayName,
    required this.currentlyBlocked,
    required this.onChanged,
    super.key,
  });

  final String userId;
  final String displayName;
  final bool currentlyBlocked;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return AppListRow(
      icon: currentlyBlocked ? AppIcons.lockOpenRounded : AppIcons.blockFlipped,
      label: t.t(currentlyBlocked ? 'block.unblock' : 'block.action'),
      showChevron: false,
      onTap: () async {
        // Close the sheet first: the confirmation dialog must sit on the
        // screen, not on the sheet.
        final navigator = Navigator.of(context);
        final rootContext = navigator.context;
        navigator.pop();
        final changed = await toggleBlock(
          rootContext,
          ref,
          userId: userId,
          displayName: displayName,
          currentlyBlocked: currentlyBlocked,
        );
        if (changed) onChanged();
      },
    );
  }
}
