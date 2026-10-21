import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-10-20 (Telegram): the chats I moved to the Archive. Same rows,
/// swipes and multi-select as the Chats list; the menu offers «Unarchive».
/// A new message does not bring a chat back. Owner 2026-10-21 (inbox 22c):
/// groups and channels have their own archives on the Channels screen.
class ArchiveScreen extends ConsumerWidget {
  const ArchiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final selection = ref.watch(chatSelectionProvider);
    final selecting = selection != null;
    final value = combineChatLists(
      ref.watch(folderConversationsProvider(ChatListFolder.archive)),
      const AsyncData(PaginatedList(items: [])),
      withGroups: false,
    );
    final entries = value.value?.items ?? const <ChatListEntry>[];
    return PopScope(
      canPop: !selecting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) ref.read(chatSelectionProvider.notifier).stop();
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => selecting
                ? ref.read(chatSelectionProvider.notifier).stop()
                : context.canPop()
                    ? context.pop()
                    : Navigator.of(context).maybePop(),
          ),
          title: Text(
            t.t('settings.archive'),
            key: const ValueKey('archive-title'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.titleMedium.copyWith(color: colors.text),
          ),
        ),
        body: Column(
          children: [
            Expanded(
              child: PagedListBody<ChatListEntry>(
                value: value,
                t: t,
                itemKey: (e) => e.id,
                edgeToEdge: true,
                itemBuilder: (context, e, _) => switch (e) {
                  DirectChatEntry(:final conversation) => ConversationRow(
                      conversation: conversation,
                      inArchive: true,
                    ),
                  // Never here (groups have their own archive).
                  GroupChatEntry() => const SizedBox.shrink(),
                },
                empty: AppEmptyState(
                  icon: AppIcons.inventory2Outlined,
                  message: t.t('tasks.archive.empty'),
                ),
                onRefresh: () async {
                  ref.invalidate(chatFolderCountsProvider);
                  await ref
                      .read(
                        folderConversationsProvider(ChatListFolder.archive)
                            .notifier,
                      )
                      .refresh();
                },
                onLoadMore: () {
                  ref
                      .read(
                        folderConversationsProvider(ChatListFolder.archive)
                            .notifier,
                      )
                      .loadMore();
                },
                onRetryMore: () {
                  ref
                      .read(
                        folderConversationsProvider(ChatListFolder.archive)
                            .notifier,
                      )
                      .retryLoadMore();
                },
              ),
            ),
            if (selecting)
              ChatSelectionBar(
                chats: [
                  for (final e in entries)
                    if (e is DirectChatEntry) e.conversation,
                ],
                inArchive: true,
              ),
          ],
        ),
      ),
    );
  }
}
