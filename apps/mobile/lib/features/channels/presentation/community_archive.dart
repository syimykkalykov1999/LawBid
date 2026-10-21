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
import 'package:lawbid/features/channels/presentation/channel_row_actions.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-21 (inbox 22c, Telegram): «Archive (N)» at the top of the
/// Groups list or of the Channels list — each section has its own archive.
class CommunityArchiveRow extends ConsumerWidget {
  const CommunityArchiveRow({
    required this.count,
    required this.channels,
    super.key,
  });

  final int count;

  /// The Channels archive (else the Groups one).
  final bool channels;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final kind = channels ? 'channels' : 'groups';
    return AppPressable(
      key: ValueKey('$kind-archive-row'),
      onTap: () => context.push(ChannelsRoutes.archive(channels: channels)),
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
                width: 48,
                height: 48,
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
                key: ValueKey('$kind-archive-count'),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-21 (inbox 22c): the archived groups, or the archived
/// channels, with the same rows, menus and multi-select as their list; the
/// menu and the bar offer «Unarchive».
class CommunityArchiveScreen extends ConsumerWidget {
  const CommunityArchiveScreen({required this.channels, super.key});

  final bool channels;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final selection = ref.watch(chatSelectionProvider);
    final selecting = selection != null;
    final notifier = ref.read(chatSelectionProvider.notifier);
    final empty = AppEmptyState(
      icon: AppIcons.inventory2Outlined,
      message: t.t('tasks.archive.empty'),
    );

    final List<api.GroupDto> groups;
    final List<Channel> channelList;
    final Widget body;
    if (channels) {
      final value = ref.watch(archivedChannelsProvider);
      channelList = value.value ?? const <Channel>[];
      groups = const [];
      body = PagedListBody<Channel>(
        value: value.whenData((l) => PaginatedList(items: l)),
        t: t,
        itemKey: (c) => c.id,
        edgeToEdge: true,
        empty: empty,
        itemBuilder: (context, c, _) => ChannelRow(
          key: ValueKey('channel-row-${c.id}'),
          channel: c,
          picked: selection?.contains(c.id),
          onTap: selecting
              ? () => notifier.toggle(c.id)
              : () => context.push(ChannelsRoutes.channel(c.id)),
          onLongPress: selecting
              ? null
              : () => showChannelOrganizeSheet(
                    context,
                    ref,
                    c,
                    inArchive: true,
                  ),
        ),
        onRefresh: () async {
          ref.invalidate(archivedChannelsProvider);
          await ref.read(archivedChannelsProvider.future);
        },
        onLoadMore: () {},
        onRetryMore: () {},
      );
    } else {
      final value = ref.watch(archivedGroupsProvider);
      groups = value.value?.items ?? const <api.GroupDto>[];
      channelList = const [];
      final n = ref.read(archivedGroupsProvider.notifier);
      body = PagedListBody<api.GroupDto>(
        value: value,
        t: t,
        itemKey: (g) => g.id,
        edgeToEdge: true,
        empty: empty,
        itemBuilder: (context, g, _) => GroupChatTile(
          key: ValueKey('group-row-${g.id}'),
          group: g,
          inArchive: true,
        ),
        onRefresh: n.refresh,
        onLoadMore: n.loadMore,
        onRetryMore: n.retryLoadMore,
      );
    }

    return PopScope(
      canPop: !selecting,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) notifier.stop();
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => selecting
                ? notifier.stop()
                : context.canPop()
                    ? context.pop()
                    : Navigator.of(context).maybePop(),
          ),
          title: Text(
            selecting
                ? t.t('chat.select.count', {
                    'count': context.digits(selection.length),
                  })
                : t.t('settings.archive'),
            key: const ValueKey('community-archive-title'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.titleMedium.copyWith(color: colors.text),
          ),
        ),
        body: body,
        bottomNavigationBar: selecting
            ? ChatSelectionBar(
                chats: const [],
                groups: groups,
                channels: channelList,
                inArchive: true,
              )
            : null,
      ),
    );
  }
}
