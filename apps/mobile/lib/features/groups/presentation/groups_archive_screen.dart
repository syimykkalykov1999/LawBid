import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:material_ui/material_ui.dart';

/// The frame of the Archive screen: back arrow (or leave the picking),
/// title, the list, and the selection bar while picking.
class _ArchiveFrame extends ConsumerWidget {
  const _ArchiveFrame({
    required this.titleKey,
    required this.body,
    required this.bar,
  });

  final ValueKey<String> titleKey;
  final Widget body;
  final Widget Function() bar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final selecting = ref.watch(chatSelectionProvider) != null;
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
                : context.safeBack(),
          ),
          title: Text(
            t.t('settings.archive'),
            key: titleKey,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.titleMedium.copyWith(color: colors.text),
          ),
        ),
        body: Column(
          children: [
            Expanded(child: body),
            if (selecting) bar(),
          ],
        ),
      ),
    );
  }
}

/// The groups I moved to the Archive (their own, apart from the chats').
class GroupsArchiveScreen extends ConsumerWidget {
  const GroupsArchiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final value = ref.watch(archivedGroupsProvider);
    final notifier = ref.read(archivedGroupsProvider.notifier);
    return _ArchiveFrame(
      titleKey: const ValueKey('groups-archive-title'),
      body: PagedListBody(
        value: value,
        t: t,
        itemKey: (g) => g.id,
        edgeToEdge: true,
        itemBuilder: (context, g, _) =>
            GroupChatTile(group: g, inArchive: true),
        empty: AppEmptyState(
          icon: AppIcons.inventory2Outlined,
          message: t.t('tasks.archive.empty'),
        ),
        onRefresh: notifier.refresh,
        onLoadMore: notifier.loadMore,
        onRetryMore: notifier.retryLoadMore,
      ),
      bar: () => ChatSelectionBar(
        chats: const [],
        groups: value.value?.items ?? const [],
        inArchive: true,
      ),
    );
  }
}
