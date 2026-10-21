import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_actions.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/shared/presentation/mute_for_sheet.dart';

/// Owner 2026-10-21 (inbox 22d): the actions a channel's menu offers by the
/// tab it is on — «Mine» the full set (pin · mute · read · archive · select
/// · unsubscribe or delete), «Following» pin · mute · archive · select ·
/// unsubscribe. A channel I do not follow (Discover, search) offers
/// «Subscribe» and «Open».
enum ChannelMenuSet { full, following }

/// The channel's notifications: on at once when muted, else off for a
/// picked time (1 h · 8 h · 2 days · forever). False = nothing changed.
Future<bool> toggleChannelMute(
  BuildContext context,
  WidgetRef ref,
  Channel c,
) async {
  if (c.mutedNow) {
    await updateMyChannel(ref, c.id, unmute: true);
    return true;
  }
  final until = await pickMuteUntil(context, ref.read(translatorProvider));
  if (until == null) return false;
  await updateMyChannel(ref, c.id, mutedUntil: until);
  return true;
}

/// The long-press menu of a channel row on the Channels screen (or in its
/// archive, [inArchive]: «Unarchive»).
Future<void> showChannelOrganizeSheet(
  BuildContext context,
  WidgetRef ref,
  Channel c, {
  ChannelMenuSet menu = ChannelMenuSet.full,
  bool inArchive = false,
}) async {
  final t = ref.read(translatorProvider);
  final full = menu == ChannelMenuSet.full;
  final muted = c.mutedNow;
  final pick = await showAppBottomSheet<String>(
    context: context,
    builder: (ctx) {
      Widget row(
        String id,
        IconData icon,
        String label, {
        bool destructive = false,
      }) =>
          AppListRow(
            key: ValueKey('channel-menu-row-$id'),
            icon: icon,
            label: label,
            destructive: destructive,
            showChevron: false,
            onTap: () => Navigator.of(ctx).pop(id),
          );
      return SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: AppSpacing.sm),
              const AppSheetHandle(),
              if (!c.isSubscribed) ...[
                row('subscribe', AppIcons.addRounded, t.t('channel.subscribe')),
                row('open', AppIcons.openInNewRounded, t.t('group.find.open')),
              ] else ...[
                row(
                  'pin',
                  AppIcons.pushPinOutlined,
                  t.t(c.pinned ? 'group.menu.unpin' : 'group.menu.pin'),
                ),
                row(
                  'mute',
                  muted
                      ? AppIcons.notificationsRounded
                      : AppIcons.notificationsOffOutlined,
                  t.t(muted ? 'channel.unmute' : 'channel.mute'),
                ),
                if (full && c.unreadCount > 0)
                  row(
                    'read',
                    AppIcons.doneAllRounded,
                    t.t('notif.markAllRead'),
                  ),
                row(
                  'archive',
                  inArchive
                      ? AppIcons.unarchiveOutlined
                      : AppIcons.inventory2Outlined,
                  t.t(inArchive ? 'chat.unarchive' : 'tasks.bulk.archive'),
                ),
                row(
                  'select',
                  AppIcons.checkCircleOutlineRounded,
                  t.t('chat.select.start'),
                ),
                if (!c.isOwner)
                  row(
                    'unsubscribe',
                    AppIcons.logoutRounded,
                    t.t('channel.unsubscribe'),
                    destructive: true,
                  )
                else if (full)
                  row(
                    'delete',
                    AppIcons.deleteOutlineRounded,
                    t.t('channel.delete'),
                    destructive: true,
                  ),
              ],
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        ),
      );
    },
  );
  if (pick == null || !context.mounted) return;
  switch (pick) {
    case 'open':
      unawaited(context.push(ChannelsRoutes.channel(c.id)));
      return;
    case 'select':
      ref.read(chatSelectionProvider.notifier)
        ..start()
        ..toggle(c.id);
      return;
  }
  // The navigator outlives the row (an archived or unsubscribed channel
  // goes away) and sits under the app's ScaffoldMessenger.
  final host = Navigator.of(context).context;
  void toast(String key) {
    if (host.mounted) showAppSnackBar(host, t.t(key));
  }

  final repo = ref.read(channelsRepositoryProvider);
  try {
    switch (pick) {
      case 'subscribe':
        await repo.subscribe(c);
        ref
          ..invalidate(channelListProvider)
          ..invalidate(recommendedChannelsProvider);
      case 'pin':
        await updateMyChannel(ref, c.id, pinned: !c.pinned);
        toast(c.pinned ? 'chat.organize.unpinned' : 'chat.organize.pinned');
      case 'mute':
        if (!context.mounted) return;
        if (await toggleChannelMute(context, ref, c)) {
          toast(muted ? 'chat.select.unmuted' : 'chat.select.muted');
        }
      case 'read':
        await updateMyChannel(ref, c.id, read: true);
      case 'archive':
        await updateMyChannel(ref, c.id, archived: !inArchive);
      case 'unsubscribe':
        await repo.unsubscribe(c);
        ref
          ..invalidate(channelListProvider)
          ..invalidate(archivedChannelsProvider);
      case 'delete':
        if (!context.mounted) return;
        final ok = await confirmChannelAction(
          context,
          ref,
          title: t.t('channel.delete.title'),
          message: t.t('channel.delete.message', {'title': c.title}),
          confirmLabel: t.t('channel.delete'),
        );
        if (!ok) return;
        await repo.delete(c.id);
        ref
          ..invalidate(channelListProvider)
          ..invalidate(archivedChannelsProvider);
    }
  } on Object catch (e) {
    if (host.mounted) showAppSnackBar(host, channelErrorText(t, e));
  }
}
