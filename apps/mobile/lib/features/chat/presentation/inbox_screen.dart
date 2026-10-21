// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/calls/application/call_history_providers.dart';
import 'package:lawbid/features/calls/presentation/call_log_entry.dart'
    show callLogKey;
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_selection.dart';
import 'package:lawbid/features/chat/application/chat_text_drafts.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/features/chat/presentation/chat_selection_bar.dart';
import 'package:lawbid/features/chat/presentation/chat_swipe.dart';
import 'package:lawbid/features/chat/presentation/chats_filter_row.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_chat_tile.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_invite_card.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/stories/presentation/stories_tray.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/team_inbox_tab.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid/shared/presentation/collapsing_header.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

// OQ-048: [team] — assistants' approval requests and activity (attorney).
enum InboxTab { chats, notifications, requests, team }

/// The screen behind the Chats icon (docs/05 §8.1, §9.1). Owner
/// 2026-09-30: three compact tabs — Chats · Notifications · Requests — in
/// one centered row on the level of the back arrow, each with its count.
/// Both sides of the header's middle are as wide as the widest icon group, so
/// the segments stay centred on the screen.
const _headerSide = EdgeInsets.symmetric(horizontal: 116);

class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({this.initialTab = InboxTab.chats, super.key});

  final InboxTab initialTab;

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  // Owner 2026-10-01: Requests live inside Chats as a folder.
  late InboxTab _tab = widget.initialTab == InboxTab.requests
      ? InboxTab.chats
      : widget.initialTab;
  late ChatListFolder _folder = widget.initialTab == InboxTab.requests
      ? ChatListFolder.requests
      : ChatListFolder.all;

  /// Owner 2026-10-18: the search box of the chats list ('' = none).
  String _query = '';

  /// The rows of the folder on screen (Select all, the bulk bar): direct
  /// chats and, in «All», my groups.
  List<ChatListEntry> _visibleEntries() {
    if (_folder == ChatListFolder.requests) return const [];
    if (_query.isNotEmpty) {
      return ref
              .watch(
                mergedChatSearchProvider((folder: _folder, q: _query)),
              )
              .value
              ?.items ??
          const [];
    }
    if (_folder == ChatListFolder.all) {
      return ref.watch(mergedChatListProvider).value?.items ?? const [];
    }
    return [
      for (final c
          in ref.watch(folderConversationsProvider(_folder)).value?.items ??
              const <Conversation>[])
        DirectChatEntry(c),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final badges = ref.watch(badgesProvider);
    final selection = ref.watch(chatSelectionProvider);
    final selecting = selection != null;
    final entries = selecting ? _visibleEntries() : const <ChatListEntry>[];
    final chats = [
      for (final e in entries)
        if (e is DirectChatEntry) e.conversation,
    ];
    final groups = [
      for (final e in entries)
        if (e is GroupChatEntry) e.group,
    ];
    final requests = ref.watch(messageRequestsCountProvider).value ?? 0;
    final showTeam = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final teamPending =
        showTeam ? (ref.watch(pendingRequestsCountProvider).value ?? 0) : 0;
    // Audit 2026-10-04: an assistant without "chats" still reaches the
    // notifications here (the bell stays open, no Chats segment).
    final chatsAllowed = ref.watch(canDoProvider(AssistantDuty.chats));
    var tab = !showTeam && _tab == InboxTab.team ? InboxTab.chats : _tab;
    if (!chatsAllowed && tab == InboxTab.chats) tab = InboxTab.notifications;
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            SizedBox(
              height: AppSizes.touchTarget + AppSpacing.md,
              // Owner 2026-10-20: the segments stay in the exact centre of the
              // screen whatever the icons at the sides; they shrink, never
              // the icons.
              child: Stack(
                // The middle is centred in both directions, not top-left.
                alignment: Alignment.center,
                children: [
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(
                        start: AppSpacing.xs,
                      ),
                      child: selecting
                          ? SizedBox.square(
                              dimension: AppSizes.touchTarget,
                              child: AppIconButton(
                                key: const ValueKey('select-cancel'),
                                icon: AppIcon(
                                  AppIcons.closeRounded,
                                  color: colors.text,
                                ),
                                semanticLabel: t.t('common.cancel'),
                                onPressed: ref
                                    .read(chatSelectionProvider.notifier)
                                    .stop,
                              ),
                            )
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                AppBackButton(
                                  semanticLabel: t.t('common.back'),
                                  onPressed: () =>
                                      Navigator.of(context).maybePop(),
                                ),
                              ],
                            ),
                    ),
                  ),
                  // Owner 2026-10-01: Chats · Requests · Team as segments,
                  // notifications as a bell at the right edge.
                  // The middle keeps clear of the buttons at both edges: a long
                  // count ellipsizes, the segments shrink on narrow phones.
                  if (selecting)
                    Padding(
                      padding: _headerSide,
                      child: Center(
                        child: Text(
                          t.t(
                            'chat.select.count',
                            {'count': '${selection.length}'},
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .extension<AppTypographyTokens>()!
                              .titleMedium
                              .copyWith(color: colors.text),
                        ),
                      ),
                    )
                  else
                    Padding(
                      padding: _headerSide,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: InboxTabsBar(
                          value: tab,
                          tabs: [
                            if (chatsAllowed)
                              (
                                InboxTab.chats,
                                t.t('inbox.tab.chats'),
                                badges.chats + requests,
                              ),
                            if (showTeam)
                              (
                                InboxTab.team,
                                t.t('inbox.tab.team'),
                                teamPending,
                              ),
                          ],
                          onChanged: (v) => setState(() => _tab = v),
                        ),
                      ),
                    ),
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: Padding(
                      padding:
                          const EdgeInsetsDirectional.only(end: AppSpacing.xs),
                      child: selecting
                          ? ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 108),
                              child: TextButton(
                                key: const ValueKey('select-all'),
                                onPressed: () {
                                  final n =
                                      ref.read(chatSelectionProvider.notifier);
                                  entries.every(
                                    (e) => selection.contains(e.id),
                                  )
                                      ? n.clear()
                                      : n.setAll(entries.map((e) => e.id));
                                },
                                child: Text(
                                  entries.isNotEmpty &&
                                          entries.every(
                                            (e) => selection.contains(e.id),
                                          )
                                      ? t.t('chat.select.none')
                                      : t.t('chat.select.all'),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                          : Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                // Owner 2026-10-02: ⋮ next to the bell —
                                // "Select chats" like Instagram.
                                // Organizing chats is the attorney's own
                                // (the server refuses an assistant).
                                if (tab == InboxTab.chats &&
                                    !ref.watch(isAssistantProvider) &&
                                    _folder != ChatListFolder.requests)
                                  AppIconButton(
                                    key: const ValueKey('chats-menu'),
                                    compact: true,
                                    icon: AppIcon(
                                      AppIcons.moreVertRounded,
                                      color: colors.text,
                                    ),
                                    semanticLabel: t.t('chat.select.menu'),
                                    onPressed: () =>
                                        _showChatsMenu(context, t, tab),
                                  ),
                                // Owner 2026-10-20 (WhatsApp): «new chat» —
                                // opens Contacts (who is on LawBid: chat,
                                // call, video, invite).
                                if (tab == InboxTab.chats)
                                  _NewChatButton(
                                    label: t.t('phoneContacts.title'),
                                  ),
                                // Owner 2026-10-02: the notification filter /
                                // settings sit up here, left of the bell, in
                                // the same place as the chats' ⋮.
                                // Owner 2026-10-20: «mark all read» up here, next to
                                // the filter and the bell, close together.
                                if (tab == InboxTab.notifications &&
                                    badges.notifications > 0)
                                  AppIconButton(
                                    key: const ValueKey('notif-mark-all'),
                                    compact: true,
                                    icon: AppIcon(
                                      AppIcons.doneAllRounded,
                                      color: colors.text,
                                    ),
                                    semanticLabel: t.t('notif.markAllRead'),
                                    onPressed: () => ref
                                        .read(notificationsProvider.notifier)
                                        .markRead(),
                                  ),
                                if (tab == InboxTab.notifications)
                                  AppIconButton(
                                    key: const ValueKey('notif-filter'),
                                    compact: true,
                                    icon: AppIcon(
                                      AppIcons.tuneRounded,
                                      color: colors.text,
                                    ),
                                    semanticLabel:
                                        t.t('settings.notifications'),
                                    onPressed: () => context
                                        .push(ChatRoutes.notificationSettings),
                                  ),
                                // Owner 2026-10-01: in Team the bell gives
                                // way to the team settings.
                                if (tab == InboxTab.team)
                                  SizedBox.square(
                                    dimension: AppSizes.touchTarget,
                                    child: AppIconButton(
                                      key: const ValueKey('team-settings'),
                                      icon: AppIcon(
                                        AppIcons.manageAccountsOutlined,
                                        size: 28,
                                        color: colors.text,
                                      ),
                                      semanticLabel: t.t('team.title'),
                                      onPressed: () =>
                                          context.push(TeamRoutes.team),
                                    ),
                                  )
                                else
                                  _Bell(
                                    count: badges.notifications,
                                    selected: tab == InboxTab.notifications,
                                    label: t.t('inbox.tab.notifications'),
                                    onTap: () => setState(
                                      () => _tab =
                                          tab == InboxTab.notifications &&
                                                  chatsAllowed
                                              ? InboxTab.chats
                                              : InboxTab.notifications,
                                    ),
                                  ),
                              ],
                            ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              // Owner 2026-10-19 (Instagram): Chats and Team are pages — the
              // next one slides in with the finger, a tap slides to it.
              child: Builder(
                builder: (context) {
                  final values = [
                    if (chatsAllowed) InboxTab.chats,
                    if (showTeam) InboxTab.team,
                  ];
                  Widget pageFor(InboxTab v) => switch (v) {
                        InboxTab.chats => chatsAllowed
                            ? ConversationsView(
                                folder: _folder,
                                onFolder: (f) => setState(() => _folder = f),
                                query: _query,
                                onQuery: (q) => setState(() => _query = q),
                              )
                            : const SizedBox.shrink(),
                        InboxTab.notifications => NotificationsView(
                            // Audit 2026-10-04: an Inbox tab target switches the
                            // tab here instead of pushing a second Inbox.
                            onInboxTab: (v) => setState(() => _tab = v),
                          ),
                        InboxTab.requests => const SizedBox.shrink(),
                        InboxTab.team => const TeamInboxTab(),
                      };
                  if (values.length > 1 && values.contains(tab)) {
                    return SwipePages<InboxTab>(
                      value: tab,
                      values: values,
                      onChanged: (v) => setState(() => _tab = v),
                      pageBuilder: (_, v) => pageFor(v),
                    );
                  }
                  return pageFor(tab);
                },
              ),
            ),
            if (selecting) ChatSelectionBar(chats: chats, groups: groups),
          ],
        ),
      ),
    );
  }

  /// The vertical ⋮ menu of the chats list: "Select chats".
  Future<void> _showChatsMenu(
    BuildContext context,
    Translator t,
    InboxTab tab,
  ) async {
    final organize =
        !ref.read(isAssistantProvider) && _folder != ChatListFolder.requests;
    final pick = await showAppBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpacing.sm),
            const AppSheetHandle(),
            if (organize) ..._groupMenuRows(ctx, t),
            if (organize)
              AppListRow(
                key: const ValueKey('chats-menu-select'),
                icon: AppIcons.checkCircleOutlineRounded,
                label: t.t('chat.select.start'),
                showChevron: false,
                onTap: () => Navigator.of(ctx).pop('select'),
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (!context.mounted) return;
    switch (pick) {
      case 'select':
        ref.read(chatSelectionProvider.notifier).start();
      case 'new':
        unawaited(context.push(GroupRoutes.create));
      case 'find':
        unawaited(context.push(GroupRoutes.find));
    }
  }
}

/// «New group» and «Find groups» rows (the ⋮ menu and the compose button).
List<Widget> _groupMenuRows(BuildContext ctx, Translator t) => [
      AppListRow(
        key: const ValueKey('menu-new-group'),
        icon: AppIcons.groupAddOutlined,
        label: t.t('group.new'),
        showChevron: false,
        onTap: () => Navigator.of(ctx).pop('new'),
      ),
      AppListRow(
        key: const ValueKey('menu-find-groups'),
        icon: AppIcons.searchRounded,
        label: t.t('group.find'),
        showChevron: false,
        onTap: () => Navigator.of(ctx).pop('find'),
      ),
    ];

/// Three compact segments with a gliding gold-bordered indicator.
/// Public for its test only.
@visibleForTesting
class InboxTabsBar extends StatelessWidget {
  const InboxTabsBar({
    required this.value,
    required this.tabs,
    required this.onChanged,
  });

  final InboxTab value;

  /// (tab, label, badge count).
  final List<(InboxTab, String, int)> tabs;
  final ValueChanged<InboxTab> onChanged;

  double get _segment => tabs.length > 3 ? 72.0 : 88.0;
  static const _height = 36.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final d = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    Widget segment(InboxTab tab, String label, int count) {
      final selected = tab == value;
      return SizedBox(
        width: _segment,
        child: Semantics(
          button: true,
          selected: selected,
          label: count > 0 ? '$label, $count' : label,
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => onChanged(tab),
            child: SizedBox(
              height: _height,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Flexible(
                    child: AnimatedDefaultTextStyle(
                      duration: d,
                      style: type.caption.copyWith(
                        color: selected ? colors.onAccent : colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  if (count > 0) ...[
                    const SizedBox(width: 3),
                    _Dot(count: count),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: colors.border),
      ),
      child: Stack(
        children: [
          // Owner 2026-10-20: `start`, not `left` — in right-to-left languages
          // the row of segments mirrors and the lit one has to follow it.
          AnimatedPositionedDirectional(
            duration: d,
            curve: AppMotion.enterCurve,
            start: _segment *
                tabs.indexWhere((x) => x.$1 == value).clamp(0, tabs.length),
            top: 0,
            // Owner 2026-10-01: with the bell open no segment is lit.
            child: AnimatedOpacity(
              duration: d,
              opacity: tabs.any((x) => x.$1 == value) ? 1 : 0,
              child: Container(
                width: _segment,
                height: _height,
                decoration: BoxDecoration(
                  color: colors.accent,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  border: Border.all(color: colors.goldStroke),
                ),
              ),
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final (tab, label, count) in tabs)
                segment(tab, label, count),
            ],
          ),
        ],
      ),
    );
  }
}

/// A small gold count for the compact tabs.
class _Dot extends StatelessWidget {
  const _Dot({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      constraints: const BoxConstraints(minWidth: 16),
      height: 16,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: colors.gold,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: type.badge.copyWith(color: colors.navy, fontSize: 10),
      ),
    );
  }
}

/// A gold count pill ("3", "99+").
class CountPill extends StatelessWidget {
  const CountPill({required this.count, super.key});

  final int count;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AnimatedSwitcher(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
      child: Container(
        key: ValueKey(count),
        constraints: const BoxConstraints(minWidth: 20),
        height: 20,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: colors.gold,
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        child: Text(
          count > 99 ? '99+' : '$count',
          style: type.badge.copyWith(color: colors.navy),
        ),
      ),
    );
  }
}

/// A chat's last-message preview: localized system messages and masked
/// contacts (§8.2, §8.3).
String messagePreview(Translator t, ChatMessage m, {String? me}) {
  if (m.kind == MessageKind.system) return systemLineText(t, m.body);
  // Owner 2026-10-20: deleted for everyone.
  if (m.revoked) {
    return '🚫 ${t.t(m.senderId != null && m.senderId == me ? 'chat.deletedMine' : 'chat.deleted')}';
  }
  // OQ-041: "📞 Missed call".
  if (m.kind == MessageKind.call && m.callLog != null) {
    return '📞 ${t.t(callLogKey(m.callLog!.outcome, outgoing: m.senderId != null && m.senderId == me))}';
  }
  // OQ-040: "🎤 Voice message 0:12".
  if (m.kind == MessageKind.voice) {
    final ms = m.voice?.durationMs ?? 0;
    final d = Duration(milliseconds: ms);
    return '🎤 ${t.t('chat.voice.label')} '
        '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
  }
  // Owner 2026-10-01: "🙂 Sticker".
  if (m.kind == MessageKind.sticker) {
    return '${m.sticker?.emoji ?? ''} ${t.t('stickers.label')}'.trim();
  }
  // Owner 2026-10-20: "🎁 Gift".
  if (m.kind == MessageKind.gift) return '🎁 ${t.t('stars.chat.label')}';
  // Owner 2026-10-20: "👤 Contact" / "📍 address".
  if (m.kind == MessageKind.contact) {
    return '👤 ${m.contact?.displayName ?? t.t('card.contact')}';
  }
  if (m.kind == MessageKind.place) return '📍 ${m.body}';
  // OQ-047: "📎 File" / "📷 Photo" (+ caption).
  if (m.kind == MessageKind.attachment) {
    final a = m.attachment;
    final photo = a?.isImage ?? false;
    final label = photo
        ? '📷 ${t.t('chat.attach.photo')}'
        : (a?.isVideo ?? false)
            ? '🎥 ${t.t('chat.attach.video')}'
            : '📄 ${t.t('chat.attach.label')}';
    return m.body.isEmpty ? label : '$label · ${m.body}';
  }
  return m.body.replaceAll(kContactMask, t.t('chat.masked'));
}

/// docs/05 §8.3 marker the server puts in place of a hidden contact.
const kContactMask = '[контакт скрыт]';

/// docs/05 §8.1 chats list. Owner 2026-10-01: Instagram-like folders on
/// top — All · Primary · General · Waiting · Requests.
class ConversationsView extends ConsumerWidget {
  const ConversationsView({
    this.folder = ChatListFolder.all,
    this.onFolder,
    this.query = '',
    this.onQuery,
    super.key,
  });

  final ChatListFolder folder;
  final ValueChanged<ChatListFolder>? onFolder;

  /// Owner 2026-10-18: the typed search ('' = the normal list). The field
  /// shows when [onQuery] is set.
  final String query;
  final ValueChanged<String>? onQuery;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    final searching = query.isNotEmpty;
    final archived = ref.watch(
      chatFolderCountsProvider.select((c) => c.value?.archived ?? 0),
    );
    Widget body;
    if (searching) {
      final key = (folder: folder, q: query);
      body = PagedListBody<ChatListEntry>(
        value: ref.watch(mergedChatSearchProvider(key)),
        t: t,
        itemKey: (e) => e.id,
        edgeToEdge: true,
        itemBuilder: (context, e, _) => _entryRow(e, highlight: query),
        empty: AppEmptyState(
          icon: AppIcons.searchRounded,
          title: t.t('chat.search.empty.title'),
          message: t.t('chat.search.empty.hint'),
        ),
        onRefresh: () => refreshChatList(ref, search: key),
        onLoadMore: () => loadMoreChatList(ref, search: key),
        onRetryMore: () => retryChatListMore(ref, search: key),
      );
    } else if (folder == ChatListFolder.requests) {
      body = const MessageRequestsView();
    } else if (folder == ChatListFolder.all) {
      // Direct chats and groups in ONE list: pinned first, then by the
      // newest activity.
      body = PagedListBody<ChatListEntry>(
        value: ref.watch(mergedChatListProvider),
        t: t,
        itemKey: (e) => e.id,
        edgeToEdge: true,
        itemBuilder: (context, e, _) => _entryRow(e),
        // Owner 2026-10-20 (Telegram): «Archive (N)» leads the list.
        header: archived > 0 ? _ArchiveRow(count: archived) : null,
        empty: AppEmptyState(
          icon: AppIcons.forumOutlined,
          title: t.t('chat.empty.title'),
          message: t.t(attorney ? 'chat.empty.attorney' : 'chat.empty.client'),
        ),
        onRefresh: () => refreshChatList(ref),
        onLoadMore: () => loadMoreChatList(ref),
        onRetryMore: () => retryChatListMore(ref),
      );
    } else {
      final provider = folderConversationsProvider(folder);
      final value = ref.watch(provider);
      final n = ref.read(provider.notifier);
      body = PagedListBody<Conversation>(
        value: value,
        t: t,
        itemKey: (c) => c.id,
        edgeToEdge: true,
        itemBuilder: (context, c, _) => ConversationRow(
          conversation: c,
          showAwaiting: folder == ChatListFolder.cases,
        ),
        header: folder == ChatListFolder.waiting
            ? Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(
                  t.t('chat.folder.waiting.explain'),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              )
            : null,
        empty: folder == ChatListFolder.all
            ? AppEmptyState(
                icon: AppIcons.forumOutlined,
                title: t.t('chat.empty.title'),
                message:
                    t.t(attorney ? 'chat.empty.attorney' : 'chat.empty.client'),
              )
            : AppEmptyState(
                icon: folder == ChatListFolder.waiting
                    ? AppIcons.hourglassEmptyRounded
                    : AppIcons.forumOutlined,
                message: t.t('chat.folder.${folder.name}.empty'),
              ),
        onRefresh: () async {
          ref.invalidate(chatFolderCountsProvider);
          await n.refresh();
        },
        onLoadMore: n.loadMore,
        onRetryMore: n.retryLoadMore,
      );
    }
    final filters = onQuery != null && onFolder != null
        ? ChatsFilterRow(
            folder: folder,
            onFolder: onFolder!,
            query: query,
            onQuery: onQuery!,
            // Owner 2026-10-20: the channels' door at the start of the row.
            leading: ref.watch(channelsEnabledProvider)
                ? AppIconButton(
                    key: const ValueKey('inbox-channels'),
                    compact: true,
                    icon: AppIcon(
                      AppIcons.campaignOutlined,
                      size: 22,
                      color: colors.text,
                    ),
                    semanticLabel: t.t('channel.title'),
                    onPressed: () => context.push(ChannelsRoutes.list),
                  )
                : null,
          )
        : onFolder != null
            ? Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: ChatFolderPills(value: folder, onChanged: onFolder!),
              )
            : null;
    // Owner 2026-10-20 (Telegram): the stories strip under the folders,
    // hidden by default; two separate pulls open it.
    return CollapsingHeader(
      collapsible: const StoriesTray(),
      hint: const StoriesChevron(),
      pinned: filters,
      body: body,
    );
  }
}

/// «Archive (N)» at the top of the Chats list; opens the Archive screen.
class _ArchiveRow extends ConsumerWidget {
  const _ArchiveRow({required this.count});

  final int count;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppPressable(
      key: const ValueKey('chats-archive-row'),
      onTap: () => context.push(ChatRoutes.archive),
      child: Semantics(
        button: true,
        label: '${t.t('settings.archive')}, $count',
        excludeSemantics: true,
        // The list gives its header the side padding already.
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
              key: const ValueKey('chats-archive-count'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

Widget _entryRow(ChatListEntry e, {String highlight = ''}) => switch (e) {
      DirectChatEntry(:final conversation) =>
        ConversationRow(conversation: conversation, highlight: highlight),
      GroupChatEntry(:final group) =>
        GroupChatTile(group: group, highlight: highlight),
    };

/// OQ-043: message requests sent to me — open one to accept or delete.
class MessageRequestsView extends ConsumerWidget {
  const MessageRequestsView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(messageRequestsProvider);
    final n = ref.read(messageRequestsProvider.notifier);
    final invites =
        ref.watch(groupInvitesProvider).value ?? const <api.GroupInviteDto>[];
    return PagedListBody<Conversation>(
      value: value,
      t: t,
      itemKey: (c) => c.id,
      edgeToEdge: true,
      itemBuilder: (context, c, _) => ConversationRow(conversation: c),
      // Owner 2026-10-21: group invitations wait here too, above the chats.
      header: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('chat.requests.explain'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            for (final invite in invites) GroupInviteCard(invite: invite),
          ],
        ),
      ),
      empty: invites.isNotEmpty
          ? const SizedBox.shrink()
          : AppEmptyState(
              icon: AppIcons.markEmailReadOutlined,
              message: t.t('chat.requests.empty'),
            ),
      onRefresh: () async {
        ref
          ..invalidate(messageRequestsCountProvider)
          ..invalidate(groupInvitesProvider);
        await n.refresh();
      },
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
    );
  }
}

/// [text] with every word of [query] (any case) in bold — the matched
/// message of a chat search.
@visibleForTesting
TextSpan boldWords(String text, String query, TextStyle style) {
  final words = query
      .split(RegExp(r'\s+'))
      .map((w) => w.trim())
      .where((w) => w.isNotEmpty)
      .map(RegExp.escape)
      .toList()
    ..sort((a, b) => b.length.compareTo(a.length));
  if (words.isEmpty) return TextSpan(text: text, style: style);
  final re = RegExp(words.join('|'), caseSensitive: false, unicode: true);
  final bold = style.copyWith(fontWeight: FontWeight.w700);
  final spans = <TextSpan>[];
  var at = 0;
  for (final m in re.allMatches(text)) {
    if (m.start > at) spans.add(TextSpan(text: text.substring(at, m.start)));
    spans.add(TextSpan(text: m.group(0), style: bold));
    at = m.end;
  }
  if (at < text.length) spans.add(TextSpan(text: text.substring(at)));
  return TextSpan(style: style, children: spans);
}

/// Telegram / WhatsApp style chat row: a flat full-width row on the screen
/// background, a round avatar, name + time, preview + badge, and a hairline
/// divider indented from the avatar. The chat's menu (pin, folder, waiting +
/// note) opens on long-press.
class ConversationRow extends ConsumerWidget {
  // ignore: use_key_in_widget_constructors
  const ConversationRow({
    required this.conversation,
    this.highlight = '',
    this.inArchive = false,
    this.showAwaiting = false,
  });

  final Conversation conversation;

  /// Owner 2026-10-18: the typed chat search — the words of it are bold in
  /// the matched message.
  final String highlight;

  /// Shown on the Archive screen: the menu offers «Unarchive».
  final bool inArchive;

  /// Owner 2026-10-21 («Cases»): mark the chat whose last message is the other
  /// side's — it waits for my answer.
  final bool showAwaiting;

  static const double _avatar = 54;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final me = ref.watch(currentUserIdProvider);
    final c = conversation;
    final typing =
        ref.watch(listTypingProvider.select((m) => m.containsKey(c.id)));
    final typingVoice =
        ref.watch(listTypingProvider.select((m) => m[c.id] ?? false));
    // Owner 2026-10-20: an unsent text shows as a red «Drafts: …».
    final draft = ref.watch(chatTextDraftsProvider.select((m) => m[c.id]));
    final who = counterpartName(t, c);
    final last = c.lastMessage;
    final unread = c.unreadCount > 0;
    // Owner 2026-10-02: in "Select chats" a tap picks the chat.
    final picking = ref.watch(chatSelectionProvider);
    final picked = picking?.contains(c.id) ?? false;
    final canOrganize = !c.awaitingMyAnswer &&
        picking == null &&
        !ref.watch(isAssistantProvider);
    void organize() =>
        showChatOrganizeSheet(context, ref, c, inArchive: inArchive);
    final read = last != null && c.counterpartLastReadId == last.id;
    final secondary = type.bodySmall.copyWith(color: colors.textSecondary);
    // Owner 2026-10-18: no @username under the chat (WhatsApp/Telegram);
    // only a case chat's case, or "request sent".
    final labelText = c.caseTitle ??
        (c.isDirect && c.myRequestPending ? t.t('chat.requests.sent') : null);
    final labelIcon = c.caseTitle != null
        ? (c.closed ? AppIcons.lockOutlineRounded : AppIcons.balanceRounded)
        : (c.myRequestPending
            ? AppIcons.scheduleSendOutlined
            : AppIcons.personOutlineRounded);
    final hasNote = c.note != null && c.note!.trim().isNotEmpty;
    // Owner 2026-10-20 (Telegram / WhatsApp): the time sits top right on the
    // title's line, at the same height in every row whatever the preview.
    final time = c.lastMessageAt == null
        ? null
        : ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 110),
            child: Text(
              SocialFormat.ago(t, f, c.lastMessageAt!),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(
                color: unread ? colors.goldAccent : colors.textSecondary,
              ),
            ),
          );
    final metas = <Widget>[
      // Owner 2026-10-01: my note on the chat, visible without opening it
      // ("send him the documents").
      if (hasNote)
        _MetaLine(
          key: ValueKey('chat-note-${c.id}'),
          icon: AppIcons.stickyNote2Outlined,
          text: c.note!,
        ),
      if (labelText != null) _MetaLine(icon: labelIcon, text: labelText),
      if (c.waiting)
        _MetaLine(
          key: ValueKey('chat-waiting-${c.id}'),
          icon: AppIcons.hourglassTopRounded,
          text: t.t('chat.waiting.chip', {
            'ago': SocialFormat.ago(t, f, c.waitingSince!),
          }),
        ),
    ];
    final row = AppPressable(
      key: ValueKey('chat-organize-${c.id}'),
      onTap: picking != null
          ? () => ref.read(chatSelectionProvider.notifier).toggle(c.id)
          : () => context.push(ChatRoutes.conversation(c.id)),
      onLongPress: canOrganize ? organize : null,
      child: Semantics(
        customSemanticsActions: canOrganize
            ? {
                CustomSemanticsAction(label: t.t('chat.organize.title')):
                    organize,
              }
            : const {},
        child: Container(
          color: picked ? colors.chip : null,
          padding: const EdgeInsets.only(left: AppSpacing.screenSide),
          child: Row(
            children: [
              if (picking != null) ...[
                Semantics(
                  checked: picked,
                  label: who,
                  excludeSemantics: true,
                  child: AppIcon(
                    picked
                        ? AppIcons.checkCircleRounded
                        : AppIcons.radioButtonUncheckedRounded,
                    key: ValueKey('chat-pick-${c.id}'),
                    color: picked ? colors.iconTint : colors.textSecondary,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
              ],
              // Owner 2026-10-18 (WhatsApp): a tap on the photo opens it
              // full screen; the rest of the row opens the chat.
              if (picking == null &&
                  !c.counterpart.hidden &&
                  c.counterpart.avatarUrl != null)
                Semantics(
                  button: true,
                  label: t.t('chat.avatar.open'),
                  child: AppPressable(
                    key: ValueKey('chat-avatar-${c.id}'),
                    onTap: () => showPhotoGallery(
                      context,
                      urls: [
                        c.counterpart.avatarFullUrl ?? c.counterpart.avatarUrl!,
                      ],
                      closeLabel: t.t('common.close'),
                    ),
                    child: CounterpartAvatar(
                      counterpart: c.counterpart,
                      size: _avatar,
                    ),
                  ),
                )
              else
                CounterpartAvatar(counterpart: c.counterpart, size: _avatar),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    border: Border(bottom: BorderSide(color: colors.border)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.only(
                      top: AppSpacing.sm + 2,
                      bottom: AppSpacing.sm + 2,
                      right: AppSpacing.screenSide,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            // The name takes the free width, so the time
                            // always sits at the right edge.
                            Expanded(
                              child: Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      who,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: type.body.copyWith(
                                        color: colors.text,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                  if (c.counterpart.verified) ...[
                                    const SizedBox(width: 3),
                                    VerifiedCheck(
                                      label: t.t('post.verified'),
                                      size: 14,
                                      gold: !c.counterpart.isAttorney,
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            // Owner 2026-10-19: «Прочитать» — the chat's
                            // note in a sheet, without opening the chat.
                            if (hasNote && picking == null) ...[
                              const SizedBox(width: AppSpacing.sm),
                              _ReadNoteChip(
                                key: ValueKey('chat-read-note-${c.id}'),
                                label: t.t('chat.note.read'),
                                onTap: () => showChatNoteSheet(context, ref, c),
                              ),
                            ],
                            if (showAwaiting &&
                                picking == null &&
                                last != null &&
                                last.senderId != me &&
                                last.kind != MessageKind.system) ...[
                              const SizedBox(width: AppSpacing.sm),
                              Container(
                                key: ValueKey('chat-awaiting-${c.id}'),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 1,
                                ),
                                decoration: BoxDecoration(
                                  border: Border.all(color: colors.gold),
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.pill),
                                ),
                                child: Text(
                                  t.t('chat.awaitsMe'),
                                  maxLines: 1,
                                  style: type.caption.copyWith(
                                    color: colors.text,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                            if (time != null) ...[
                              const SizedBox(width: AppSpacing.sm),
                              time,
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            // Owner 2026-10-01: ✓ sent / ✓✓ read on my last
                            // message, "typing…" while the other side types.
                            if (!typing &&
                                draft == null &&
                                last != null &&
                                last.senderId == me) ...[
                              AppIcon(
                                read
                                    ? AppIcons.doneAllRounded
                                    : AppIcons.doneRounded,
                                key: ValueKey(
                                  read
                                      ? 'chat-read-${c.id}'
                                      : 'chat-sent-${c.id}',
                                ),
                                size: 16,
                                color: read ? chat.tickRead : chat.tick,
                              ),
                              const SizedBox(width: 4),
                            ],
                            Expanded(
                              child: typing
                                  ? Text(
                                      t.t(
                                        typingVoice
                                            ? 'chat.recordingVoice'
                                            : 'chat.typing',
                                      ),
                                      key: ValueKey('chat-typing-${c.id}'),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: type.bodySmall.copyWith(
                                        color: colors.goldAccent,
                                        fontStyle: FontStyle.italic,
                                      ),
                                    )
                                  : draft != null && highlight.isEmpty
                                      ? Text.rich(
                                          key: ValueKey('chat-draft-${c.id}'),
                                          TextSpan(
                                            children: [
                                              TextSpan(
                                                text:
                                                    '${t.t('mine.tab.drafts')}: ',
                                                style: TextStyle(
                                                  color: colors.dangerText,
                                                ),
                                              ),
                                              TextSpan(text: draft),
                                            ],
                                          ),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: secondary,
                                        )
                                      : (c.matchedMessage?.isNotEmpty ?? false)
                                          ? Text.rich(
                                              key: ValueKey(
                                                'chat-match-${c.id}',
                                              ),
                                              boldWords(
                                                c.matchedMessage!,
                                                highlight,
                                                secondary,
                                              ),
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                            )
                                          : Text(
                                              last == null
                                                  ? ''
                                                  : '${last.senderId == me ? '${t.t('chat.you')}: ' : ''}'
                                                      '${messagePreview(t, last, me: me)}',
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: unread
                                                  ? secondary.copyWith(
                                                      color: colors.text,
                                                    )
                                                  : secondary,
                                            ),
                            ),
                            if (c.muted) ...[
                              const SizedBox(width: AppSpacing.sm),
                              AppIcon(
                                AppIcons.notificationsOffOutlined,
                                size: 16,
                                color: colors.textSecondary,
                              ),
                            ],
                            if (c.pinned) ...[
                              const SizedBox(width: AppSpacing.sm),
                              AppIcon(
                                AppIcons.pushPin,
                                size: 16,
                                color: colors.textSecondary,
                              ),
                            ],
                            if (unread) ...[
                              const SizedBox(width: AppSpacing.sm),
                              CountPill(count: c.unreadCount),
                            ],
                          ],
                        ),
                        ...metas,
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
    // Owner 2026-10-20 (Telegram): swipe right pins, swipe left mutes; the
    // row springs back (the action is done, the row stays in the list).
    Future<void> act(Future<Conversation> Function() call, String done) async {
      try {
        await call();
        refreshChatFolders(ref);
        if (context.mounted) showAppSnackBar(context, t.t(done));
      } on Object catch (e) {
        if (context.mounted) showAppSnackBar(context, errorText(t, e));
      }
    }

    final repo = ref.read(chatRepositoryProvider);
    return ChatSwipe(
      id: c.id,
      pinned: c.pinned,
      muted: c.muted,
      onPin: () => unawaited(
        act(
          () => repo.organize(c.id, pinned: !c.pinned),
          c.pinned ? 'chat.organize.unpinned' : 'chat.organize.pinned',
        ),
      ),
      onMute: () => unawaited(
        act(
          () => repo.mute(
            c.id,
            c.muted ? null : DateTime.now().add(const Duration(days: 3650)),
          ),
          c.muted ? 'chat.select.unmuted' : 'chat.select.muted',
        ),
      ),
      child: row,
    );
  }
}

/// Owner 2026-10-19: a chat's note read from the chat list — a sheet with
/// the note, whether the chat waits for my answer, «Открыть чат» and
/// «Изменить» (the chat's own menu), without opening the chat.
Future<void> showChatNoteSheet(
  BuildContext context,
  WidgetRef ref,
  Conversation c,
) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) =>
          _ChatNoteSheet(conversation: c, host: context, hostRef: ref),
    );

class _ChatNoteSheet extends ConsumerWidget {
  const _ChatNoteSheet({
    required this.conversation,
    required this.host,
    required this.hostRef,
  });

  /// The list row's ref (alive after the sheet closes).
  final WidgetRef hostRef;

  final Conversation conversation;

  /// The list's context (the sheet's own one is gone once it closes).
  final BuildContext host;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = conversation;
    final canEdit = !c.awaitingMyAnswer && !ref.watch(isAssistantProvider);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.sm,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.8,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Row(
                children: [
                  CounterpartAvatar(counterpart: c.counterpart, size: 36),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      counterpartName(t, c),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Flexible(
                child: Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: colors.goldTint,
                    borderRadius: BorderRadius.circular(AppRadii.card),
                  ),
                  child: SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            AppIcon(
                              AppIcons.stickyNote2Outlined,
                              size: 16,
                              color: colors.iconTint,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              t.t('chat.note.title'),
                              style: type.caption.copyWith(
                                color: colors.textSecondary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        SelectableText(
                          c.note ?? '',
                          style: type.body.copyWith(color: colors.text),
                        ),
                        if (c.waiting && c.waitingSince != null) ...[
                          const SizedBox(height: AppSpacing.sm),
                          Row(
                            children: [
                              AppIcon(
                                AppIcons.hourglassTopRounded,
                                size: 14,
                                color: colors.textSecondary,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  t.t('chat.waiting.chip', {
                                    'ago':
                                        SocialFormat.ago(t, f, c.waitingSince!),
                                  }),
                                  style: type.caption.copyWith(
                                    color: colors.textSecondary,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                key: const ValueKey('chat-note-open'),
                label: t.t('chat.note.openChat'),
                icon: AppIcons.chatBubbleOutlineRounded,
                onPressed: () {
                  Navigator.of(context).pop();
                  host.push(ChatRoutes.conversation(c.id));
                },
              ),
              if (canEdit) ...[
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  key: const ValueKey('chat-note-edit'),
                  label: t.t('common.edit'),
                  icon: AppIcons.editOutlined,
                  variant: AppButtonVariant.secondary,
                  onPressed: () {
                    Navigator.of(context).pop();
                    showChatOrganizeSheet(host, hostRef, c);
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-19: «Прочитать» at a chat's top right — opens its note.
class _ReadNoteChip extends StatelessWidget {
  const _ReadNoteChip({required this.label, required this.onTap, super.key});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: colors.iconTintFill,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: colors.gold.withValues(alpha: 0.5)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(
                AppIcons.stickyNote2Outlined,
                size: 13,
                color: colors.iconTint,
              ),
              const SizedBox(width: 4),
              Text(
                label,
                style: type.caption.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small secondary line under the preview (@username, case, note, waiting).
class _MetaLine extends StatelessWidget {
  const _MetaLine({required this.icon, required this.text, super.key});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        children: [
          AppIcon(icon, size: 12, color: colors.textSecondary),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Клиент по кейсу «…»" until contacts unlock (§8.1), else the name.
String counterpartName(Translator t, Conversation c) {
  final p = c.counterpart;
  if (p.hidden) {
    final title = c.caseTitle;
    return title == null
        ? t.t('chat.hiddenClient.direct')
        : t.t('chat.hiddenClient', {'title': title});
  }
  return p.displayName ?? (p.username == null ? '' : atHandle(p.username));
}

class CounterpartAvatar extends StatelessWidget {
  const CounterpartAvatar({
    required this.counterpart,
    required this.size,
    this.online,
    super.key,
  });

  final Counterpart counterpart;
  final double size;

  /// Owner 2026-10-01: a gold dot when online (null = the list's value).
  final bool? online;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    if (counterpart.hidden) {
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: colors.iconTintFill,
          border: Border.all(color: colors.iconTint),
        ),
        child: AppIcon(
          AppIcons.personOutlineRounded,
          color: colors.iconTint,
          size: size * 0.5,
        ),
      );
    }
    final name = counterpart.displayName ?? counterpart.username ?? '?';
    final avatar = GoldRingAvatar(
      url: counterpart.avatarUrl,
      initials: avatarInitials(name),
      size: size,
      ring: counterpart.verified,
    );
    if (!(online ?? counterpart.online ?? false)) return avatar;
    final dot = (size * 0.26).clamp(10.0, 16.0);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        avatar,
        Positioned(
          right: 0,
          bottom: 0,
          child: Container(
            key: const ValueKey('presence-dot'),
            width: dot,
            height: dot,
            decoration: BoxDecoration(
              color: colors.gold,
              shape: BoxShape.circle,
              border: Border.all(color: colors.bg, width: 2),
            ),
          ),
        ),
      ],
    );
  }
}

/// The notifications bell at the right edge of Inbox (with the unread
/// count); gold when the notifications list is open.
class _Bell extends StatelessWidget {
  const _Bell({
    required this.count,
    required this.selected,
    required this.label,
    required this.onTap,
  });

  final int count;
  final bool selected;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: count > 0 ? '$label, $count' : label,
      excludeSemantics: true,
      child: AppPressable(
        key: const ValueKey('inbox-bell'),
        onTap: onTap,
        child: SizedBox(
          width: 40,
          height: AppSizes.touchTarget,
          child: Stack(
            alignment: Alignment.center,
            children: [
              AppIcon(
                selected
                    ? AppIcons.notificationsRounded
                    : AppIcons.notificationsNoneRounded,
                color: selected ? colors.iconTint : colors.text,
                size: 28,
              ),
              if (count > 0)
                Positioned(top: 4, right: 2, child: _Dot(count: count)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-20 (WhatsApp): «new chat» — opens Contacts (who is on
/// LawBid: chat, call, video, invite).
///
/// Owner 2026-10-21: while a group call runs that this person can join or
/// return to, the «+» glows green and opens the «Calls» section, where the
/// running calls are listed on top.
class _NewChatButton extends ConsumerWidget {
  const _NewChatButton({required this.label});

  final String label;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final live =
        (ref.watch(ongoingGroupCallsProvider).value ?? const []).isNotEmpty;
    return AppIconButton(
      key: const ValueKey('chats-new-chat'),
      compact: true,
      icon: live
          ? DecoratedBox(
              key: const ValueKey('chats-new-chat-live'),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: colors.success,
              ),
              child: const Padding(
                padding: EdgeInsets.all(2),
                child: AppIcon(AppIcons.addRounded, color: Colors.white),
              ),
            )
          : AppIcon(AppIcons.addRounded, color: colors.iconTint),
      semanticLabel: label,
      onPressed: () => context.push(
        live ? '${AppRoutes.contacts}?tab=calls' : AppRoutes.contacts,
      ),
    );
  }
}
