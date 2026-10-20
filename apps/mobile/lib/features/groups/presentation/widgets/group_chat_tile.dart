import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/presentation/chat_swipe.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// A group in the Chats list: same look and height as a direct chat row.
/// A tap opens the group (or picks it in «Select chats»); a long press
/// opens its menu (pin · mute · hide).
class GroupChatTile extends ConsumerWidget {
  const GroupChatTile({
    required this.group,
    this.highlight = '',
    this.inArchive = false,
    super.key,
  });

  final api.GroupDto group;

  /// The typed chats search: matching words of the title are bold.
  final String highlight;

  /// Shown on the Archive screen: the menu offers «Unarchive».
  final bool inArchive;

  static const double _avatar = 54;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final g = group;
    final picking = ref.watch(chatSelectionProvider);
    final picked = picking?.contains(g.id) ?? false;
    final muted = isGroupMuted(g);
    final unread = g.unreadCount.toInt();
    final mentions = g.unreadMentions.toInt();
    final last = g.lastMessage;
    final at = g.lastMessageAt;
    final canOrganize = picking == null && !ref.watch(isAssistantProvider);
    void organize() =>
        showGroupOrganizeSheet(context, ref, g, inArchive: inArchive);
    final secondary = type.bodySmall.copyWith(color: colors.textSecondary);
    final hot = unread > 0 && !muted;
    final title = g.title.trim().isEmpty ? '?' : g.title.trim();
    final row = AppPressable(
      key: ValueKey('group-tile-${g.id}'),
      onTap: picking != null
          ? () => ref.read(chatSelectionProvider.notifier).toggle(g.id)
          : () => context.push(GroupRoutes.group(g.id)),
      onLongPress: canOrganize ? organize : null,
      child: Semantics(
        customSemanticsActions: canOrganize
            ? {CustomSemanticsAction(label: t.t('group.menu.title')): organize}
            : const {},
        child: Container(
          color: picked ? colors.chip : null,
          padding:
              const EdgeInsetsDirectional.only(start: AppSpacing.screenSide),
          child: Row(
            children: [
              if (picking != null) ...[
                Semantics(
                  checked: picked,
                  label: title,
                  excludeSemantics: true,
                  child: AppIcon(
                    picked
                        ? AppIcons.checkCircleRounded
                        : AppIcons.radioButtonUncheckedRounded,
                    key: ValueKey('group-pick-${g.id}'),
                    color: picked ? colors.goldAccent : colors.textSecondary,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
              ],
              GoldRingAvatar(
                url: g.avatarUrl,
                initials: title.characters.first.toUpperCase(),
                size: _avatar,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: colors.border)),
                  ),
                  child: Padding(
                    padding: const EdgeInsetsDirectional.only(
                      top: AppSpacing.sm + 2,
                      bottom: AppSpacing.sm + 2,
                      end: AppSpacing.screenSide,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Row(
                                children: [
                                  Flexible(
                                    child: Text.rich(
                                      _bold(g.title, highlight, type, colors),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            if (at != null) ...[
                              const SizedBox(width: AppSpacing.sm),
                              ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 110),
                                child: Text(
                                  SocialFormat.ago(t, f, at),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.caption.copyWith(
                                    color: hot
                                        ? colors.goldAccent
                                        : colors.textSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                last == null
                                    ? t.t('group.empty.preview')
                                    : groupMessagePreview(
                                        t,
                                        last,
                                        withSender: true,
                                      ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: unread > 0
                                    ? secondary.copyWith(color: colors.text)
                                    : secondary,
                              ),
                            ),
                            if (muted) ...[
                              const SizedBox(width: AppSpacing.sm),
                              AppIcon(
                                AppIcons.notificationsOffOutlined,
                                size: 16,
                                color: colors.textSecondary,
                              ),
                            ],
                            if (g.pinned) ...[
                              const SizedBox(width: AppSpacing.sm),
                              AppIcon(
                                AppIcons.pushPin,
                                size: 16,
                                color: colors.textSecondary,
                              ),
                            ],
                            if (mentions > 0) ...[
                              const SizedBox(width: AppSpacing.sm),
                              _Badge(
                                key: ValueKey('group-mention-${g.id}'),
                                text: '@',
                                muted: false,
                              ),
                            ],
                            if (unread > 0) ...[
                              const SizedBox(width: AppSpacing.sm),
                              _Badge(
                                key: ValueKey('group-unread-${g.id}'),
                                text: unread > 99 ? '99+' : '$unread',
                                muted: muted,
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (!canOrganize) return row;
    // Owner 2026-10-20 (Telegram): the same swipes as a direct chat.
    Future<void> act(Future<void> Function() call, String done) async {
      try {
        await call();
        if (context.mounted) showAppSnackBar(context, t.t(done));
      } on Object catch (e) {
        if (context.mounted) showAppSnackBar(context, errorText(t, e));
      }
    }

    return ChatSwipe(
      id: g.id,
      pinned: g.pinned,
      muted: muted,
      onPin: () => unawaited(
        act(
          () => updateMyGroup(ref, g.id, pinned: !g.pinned),
          g.pinned ? 'chat.organize.unpinned' : 'chat.organize.pinned',
        ),
      ),
      onMute: () => unawaited(
        act(
          () => updateMyGroup(ref, g.id, muted: !muted),
          muted ? 'chat.select.unmuted' : 'chat.select.muted',
        ),
      ),
      child: row,
    );
  }
}

TextSpan _bold(
  String text,
  String query,
  AppTypographyTokens type,
  AppColorTokens colors,
) {
  final base = type.body.copyWith(
    color: colors.text,
    fontWeight: FontWeight.w700,
  );
  final words = query
      .split(RegExp(r'\s+'))
      .where((w) => w.isNotEmpty)
      .map(RegExp.escape)
      .toList();
  if (words.isEmpty) return TextSpan(text: text, style: base);
  final re = RegExp(words.join('|'), caseSensitive: false, unicode: true);
  final spans = <TextSpan>[];
  var at = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > at) spans.add(TextSpan(text: text.substring(at, m.start)));
    spans.add(
      TextSpan(
        text: m.group(0),
        style: TextStyle(
          fontWeight: FontWeight.w900,
          color: colors.goldAccent,
        ),
      ),
    );
    at = m.end;
  }
  if (at < text.length) spans.add(TextSpan(text: text.substring(at)));
  return TextSpan(style: base, children: spans);
}

/// A count pill: gold for a live group, neutral grey when muted.
class _Badge extends StatelessWidget {
  const _Badge({required this.text, required this.muted, super.key});

  final String text;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: muted ? colors.textSecondary : colors.gold,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        text,
        style: type.badge.copyWith(color: muted ? colors.bg : colors.navy),
      ),
    );
  }
}

/// The long-press menu of one group: pin · mute · hide from my list.
Future<void> showGroupOrganizeSheet(
  BuildContext context,
  WidgetRef ref,
  api.GroupDto g, {
  bool inArchive = false,
}) async {
  final t = ref.read(translatorProvider);
  final muted = isGroupMuted(g);
  final pick = await showAppBottomSheet<String>(
    context: context,
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: AppSpacing.sm),
          const AppSheetHandle(),
          AppListRow(
            key: const ValueKey('group-menu-pin'),
            icon: AppIcons.pushPinOutlined,
            label: t.t(g.pinned ? 'group.menu.unpin' : 'group.menu.pin'),
            showChevron: false,
            onTap: () => Navigator.of(ctx).pop('pin'),
          ),
          AppListRow(
            key: const ValueKey('group-menu-mute'),
            icon: AppIcons.notificationsOffOutlined,
            label: t.t(muted ? 'group.menu.unmute' : 'group.menu.mute'),
            showChevron: false,
            onTap: () => Navigator.of(ctx).pop('mute'),
          ),
          AppListRow(
            key: const ValueKey('group-menu-archive'),
            icon: inArchive
                ? AppIcons.unarchiveOutlined
                : AppIcons.inventory2Outlined,
            label: t.t(inArchive ? 'chat.unarchive' : 'tasks.bulk.archive'),
            showChevron: false,
            onTap: () => Navigator.of(ctx).pop('archive'),
          ),
          AppListRow(
            key: const ValueKey('group-menu-select'),
            icon: AppIcons.checkCircleOutlineRounded,
            label: t.t('chat.select.start'),
            showChevron: false,
            onTap: () => Navigator.of(ctx).pop('select'),
          ),
          AppListRow(
            key: const ValueKey('group-menu-hide'),
            icon: AppIcons.deleteOutlineRounded,
            label: t.t('group.menu.hide'),
            destructive: true,
            showChevron: false,
            onTap: () => Navigator.of(ctx).pop('hide'),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    ),
  );
  if (pick == null || !context.mounted) return;
  if (pick == 'select') {
    ref.read(chatSelectionProvider.notifier)
      ..start()
      ..toggle(g.id);
    return;
  }
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    switch (pick) {
      case 'pin':
        await updateMyGroup(ref, g.id, pinned: !g.pinned);
      case 'mute':
        await updateMyGroup(ref, g.id, muted: !muted);
      case 'archive':
        await updateMyGroup(ref, g.id, archived: !inArchive);
      case 'hide':
        await updateMyGroup(ref, g.id, hidden: true);
    }
  } on Object catch (e) {
    if (messenger != null && messenger.mounted) {
      showAppSnackBar(messenger.context, errorText(t, e));
    }
  }
}
