import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:material_ui/material_ui.dart';

/// Block / unblock [userId] with a confirmation for blocking (owner
/// 2026-09-29, OQ-028). Returns true when the state changed. Callers
/// refresh the profile they show (its `isBlocked` flag).
///
/// Round 1 check 25.11 №1: the providers are read through the container
/// of [context], not a caller's `WidgetRef`. The «⋯» sheet's row closes its
/// sheet first, and its own `ref` was disposed by the time the dialog
/// answered (Riverpod 3: «Cannot use ref after the widget was disposed») —
/// «Block» did nothing and showed an error.
Future<bool> toggleBlock(
  BuildContext context, {
  required String userId,
  required String displayName,
  required bool currentlyBlocked,
}) async {
  final ref = ProviderScope.containerOf(context, listen: false);
  final t = ref.read(translatorProvider);
  if (!currentlyBlocked) {
    final ok = await showAppDialog<bool>(
      context: context,
      builder: (dialog) => AppAlertDialog(
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
    // ignore: cascade_invocations
    ref
      ..invalidate(blockedIdsProvider)
      ..invalidate(feedProvider)
      ..invalidate(conversationsProvider)
      ..invalidate(folderConversationsProvider)
      ..invalidate(suggestionsProvider);
    // Verify 17.11: a block removes the follow both ways on the server —
    // the tap's «following» and count must not outlive it.
    ref.read(followOverridesProvider.notifier).forget(userId);
    ref.read(followerCountsProvider.notifier).forget(userId);
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
          userId: userId,
          displayName: displayName,
          currentlyBlocked: currentlyBlocked,
        );
        if (changed) onChanged();
      },
    );
  }
}
