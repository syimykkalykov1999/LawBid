import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';

/// Owner 2026-10-21 (inbox 22c): «Archive (N)» at the top of a section's own
/// list (Groups or Channels); opens that section's Archive.
class SectionArchiveRow extends ConsumerWidget {
  const SectionArchiveRow({
    required this.count,
    required this.route,
    super.key,
  });

  final int count;
  final String route;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppPressable(
      key: const ValueKey('section-archive-row'),
      onTap: () => context.push(route),
      child: Semantics(
        button: true,
        label: '${t.t('settings.archive')}, $count',
        excludeSemantics: true,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.chip,
                  shape: BoxShape.circle,
                ),
                child: AppIcon(
                  AppIcons.inventory2Outlined,
                  color: colors.textSecondary,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  t.t('settings.archive'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                context.digits(count),
                key: const ValueKey('section-archive-count'),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The frame of both Archive screens: back arrow (or leave the picking),
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
                : context.canPop()
                    ? context.pop()
                    : Navigator.of(context).maybePop(),
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

/// The channels I moved to the Archive.
class ChannelsArchiveScreen extends ConsumerWidget {
  const ChannelsArchiveScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final value = ref.watch(archivedChannelsProvider);
    final picking = ref.watch(chatSelectionProvider);
    final selection = ref.read(chatSelectionProvider.notifier);
    final channels = value.value ?? const <Channel>[];
    return _ArchiveFrame(
      titleKey: const ValueKey('channels-archive-title'),
      body: value.hasError && channels.isEmpty
          ? CasesErrorView(
              error: value.error!,
              t: t,
              onRetry: () =>
                  ref.invalidate(channelListSyncProvider(archivedChannelsKey)),
            )
          : value.isLoading && !value.hasValue
              ? const CasesListSkeleton()
              : RefreshIndicator(
                  onRefresh: () => ref
                      .read(
                        channelListSyncProvider(archivedChannelsKey).notifier,
                      )
                      .refresh(),
                  child: channels.isEmpty
                      ? ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            SizedBox(
                              height: 320,
                              child: AppEmptyState(
                                icon: AppIcons.inventory2Outlined,
                                message: t.t('tasks.archive.empty'),
                              ),
                            ),
                          ],
                        )
                      : ListView(
                          physics: const AlwaysScrollableScrollPhysics(),
                          children: [
                            for (final c in channels)
                              ChannelRow(
                                key: ValueKey('channel-archived-${c.id}'),
                                channel: c,
                                picked: picking?.contains(c.id),
                                onTap: picking != null
                                    ? () => selection.toggle(c.id)
                                    : () => context
                                        .push(ChannelsRoutes.channel(c.id)),
                                onLongPress: picking == null
                                    ? () => selection
                                      ..start()
                                      ..toggle(c.id)
                                    : null,
                              ),
                          ],
                        ),
                ),
      bar: () => ChatSelectionBar(
        chats: const [],
        channels: channels,
        inArchive: true,
      ),
    );
  }
}
