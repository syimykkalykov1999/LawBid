import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/calls/presentation/call_log_entry.dart'
    show callLogKey;
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/presentation/team_inbox_tab.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

// OQ-048: [team] — assistants' approval requests and activity (attorney).
enum InboxTab { chats, notifications, requests, team }

/// The screen behind the Chats icon (docs/05 §8.1, §9.1). Owner
/// 2026-09-30: three compact tabs — Chats · Notifications · Requests — in
/// one centered row on the level of the back arrow, each with its count.
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

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final badges = ref.watch(badgesProvider);
    final requests = ref.watch(messageRequestsCountProvider).value ?? 0;
    final showTeam = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final teamPending =
        showTeam ? (ref.watch(pendingRequestsCountProvider).value ?? 0) : 0;
    final tab = !showTeam && _tab == InboxTab.team ? InboxTab.chats : _tab;
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            SizedBox(
              height: AppSizes.touchTarget + AppSpacing.md,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Padding(
                      padding: const EdgeInsets.only(left: AppSpacing.xs),
                      child: AppBackButton(
                        semanticLabel: t.t('common.back'),
                        onPressed: () => Navigator.of(context).maybePop(),
                      ),
                    ),
                  ),
                  // Owner 2026-10-01: Chats · Requests · Team as segments,
                  // notifications as a bell at the right edge.
                  _InboxTabs(
                    value: tab,
                    tabs: [
                      (
                        InboxTab.chats,
                        t.t('inbox.tab.chats'),
                        badges.chats + requests,
                      ),
                      if (showTeam)
                        (InboxTab.team, t.t('inbox.tab.team'), teamPending),
                    ],
                    onChanged: (v) => setState(() => _tab = v),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: Padding(
                      padding: const EdgeInsets.only(right: AppSpacing.xs),
                      // Owner 2026-10-01: in Team the bell gives way to
                      // the team settings (seats, access).
                      child: tab == InboxTab.team
                          ? SizedBox.square(
                              dimension: AppSizes.touchTarget,
                              child: AppIconButton(
                                key: const ValueKey('team-settings'),
                                plain: true,
                                icon: AppIcon(
                                  AppIcons.manageAccountsOutlined,
                                  size: 28,
                                  color: colors.text,
                                ),
                                semanticLabel: t.t('team.title'),
                                onPressed: () => context.push(TeamRoutes.team),
                              ),
                            )
                          : _Bell(
                              count: badges.notifications,
                              selected: tab == InboxTab.notifications,
                              label: t.t('inbox.tab.notifications'),
                              onTap: () => setState(() => _tab =
                                  tab == InboxTab.notifications
                                      ? InboxTab.chats
                                      : InboxTab.notifications),
                            ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: TabSwipe<InboxTab>(
                value: tab,
                values: [InboxTab.chats, if (showTeam) InboxTab.team],
                onChanged: (v) => setState(() => _tab = v),
                child: IndexedStack(
                  index: tab.index,
                  children: [
                    ConversationsView(
                      folder: _folder,
                      onFolder: (f) => setState(() => _folder = f),
                    ),
                    NotificationsView(
                      // Owner 2026-10-01: on the same line as All ·
                      // Assistants.
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (badges.notifications > 0)
                            TextButton(
                              onPressed: () => ref
                                  .read(notificationsProvider.notifier)
                                  .markRead(),
                              child: Text(t.t('notif.markAllRead')),
                            ),
                          AppIconButton(
                            plain: true,
                            icon: AppIcon(AppIcons.tuneRounded,
                                color: colors.text),
                            semanticLabel: t.t('settings.notifications'),
                            onPressed: () =>
                                context.push(ChatRoutes.notificationSettings),
                          ),
                        ],
                      ),
                    ),
                    // Requests moved into Chats (kept for the stack index).
                    const SizedBox.shrink(),
                    if (showTeam) const TeamInboxTab(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Three compact segments with a gliding gold-bordered indicator.
class _InboxTabs extends StatelessWidget {
  const _InboxTabs({
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
                        fontWeight: FontWeight.w700,
                      ),
                      child: Text(label,
                          maxLines: 1, overflow: TextOverflow.ellipsis),
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
          AnimatedPositioned(
            duration: d,
            curve: AppMotion.enterCurve,
            left: _segment *
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
  if (m.kind == MessageKind.system) return t.t('chat.system.${m.body}');
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
  // OQ-047: "📎 File" / "📷 Photo" (+ caption).
  if (m.kind == MessageKind.attachment) {
    final photo = m.attachment?.isImage ?? false;
    final label = photo
        ? '📷 ${t.t('chat.attach.photo')}'
        : '📎 ${t.t('chat.attach.label')}';
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
    super.key,
  });

  final ChatListFolder folder;
  final ValueChanged<ChatListFolder>? onFolder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    Widget body;
    if (folder == ChatListFolder.requests) {
      body = const MessageRequestsView();
    } else {
      final provider = folder == ChatListFolder.all
          ? conversationsProvider
          : folderConversationsProvider(folder);
      final value = ref.watch(provider);
      final n = ref.read(provider.notifier);
      body = PagedListBody<Conversation>(
        value: value,
        t: t,
        itemKey: (c) => c.id,
        itemBuilder: (context, c, _) => ConversationRow(conversation: c),
        header: folder == ChatListFolder.waiting
            ? Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: Text(t.t('chat.folder.waiting.explain'),
                    style:
                        type.bodySmall.copyWith(color: colors.textSecondary)),
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
    return Column(
      children: [
        if (onFolder != null) ...[
          ChatFolderPills(value: folder, onChanged: onFolder!),
          const SizedBox(height: AppSpacing.sm),
        ],
        Expanded(child: body),
      ],
    );
  }
}

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
    return PagedListBody<Conversation>(
      value: value,
      t: t,
      itemKey: (c) => c.id,
      itemBuilder: (context, c, _) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: ConversationRow(conversation: c),
      ),
      header: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: Text(t.t('chat.requests.explain'),
            style: type.bodySmall.copyWith(color: colors.textSecondary)),
      ),
      empty: AppEmptyState(
        icon: AppIcons.markEmailReadOutlined,
        message: t.t('chat.requests.empty'),
      ),
      onRefresh: () async {
        ref.invalidate(messageRequestsCountProvider);
        await n.refresh();
      },
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
    );
  }
}

class ConversationRow extends ConsumerWidget {
  const ConversationRow({required this.conversation});

  final Conversation conversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final L10nFormats f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(currentUserIdProvider);
    final c = conversation;
    final who = counterpartName(t, c);
    final last = c.lastMessage;
    final unread = c.unreadCount > 0;
    return AppPressable(
      onTap: () => context.push(ChatRoutes.conversation(c.id)),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: unread ? colors.goldStroke : colors.border),
        ),
        child: Row(
          children: [
            CounterpartAvatar(counterpart: c.counterpart, size: 52),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      // The name takes all the room the time leaves, so a
                      // full name like "Syimyk Kalykov" fits; only long
                      // names get an ellipsis.
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
                                  fontWeight: unread
                                      ? FontWeight.w700
                                      : FontWeight.w600,
                                ),
                              ),
                            ),
                            if (c.counterpart.verified) ...[
                              const SizedBox(width: 3),
                              VerifiedCheck(
                                  label: t.t('post.verified'), size: 14),
                            ],
                            if (c.muted) ...[
                              const SizedBox(width: AppSpacing.xs),
                              AppIcon(AppIcons.notificationsOffOutlined,
                                  size: 14, color: colors.textSecondary),
                            ],
                            if (c.pinned) ...[
                              const SizedBox(width: AppSpacing.xs),
                              AppIcon(AppIcons.pushPin,
                                  size: 14, color: colors.goldDark),
                            ],
                          ],
                        ),
                      ),
                      // Owner 2026-10-01: the chat's menu at the top right —
                      // pin, move to a folder, waiting + a note.
                      if (!c.awaitingMyAnswer)
                        Semantics(
                          button: true,
                          label: t.t('chat.organize.title'),
                          child: InkResponse(
                            key: ValueKey('chat-organize-${c.id}'),
                            radius: 22,
                            onTap: () => showChatOrganizeSheet(context, ref, c),
                            child: Padding(
                              padding: const EdgeInsets.only(left: 6),
                              child: SizedBox(
                                width: 32,
                                height: 28,
                                child: AppIcon(AppIcons.moreHorizRounded,
                                    color: colors.textSecondary),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          last == null
                              ? ''
                              : '${last.senderId == me ? '${t.t('chat.you')}: ' : ''}'
                                  '${messagePreview(t, last, me: me)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall.copyWith(
                            color: unread ? colors.text : colors.textSecondary,
                          ),
                        ),
                      ),
                      if (unread) ...[
                        const SizedBox(width: AppSpacing.sm),
                        CountPill(count: c.unreadCount),
                      ],
                    ],
                  ),
                  // Owner 2026-10-01: my note on the chat, visible without
                  // opening it ("send him the documents").
                  if (c.note != null && c.note!.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Container(
                      key: ValueKey('chat-note-${c.id}'),
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm, vertical: 5),
                      decoration: BoxDecoration(
                        color: colors.goldTint,
                        borderRadius: BorderRadius.circular(AppRadii.field),
                        border: Border(
                          left: BorderSide(color: colors.gold, width: 2),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppIcon(AppIcons.stickyNote2Outlined,
                              size: 14, color: colors.goldDark),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              c.note!,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: type.caption.copyWith(color: colors.text),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.xs),
                  Row(
                    children: [
                      Expanded(
                        child: Wrap(
                          spacing: AppSpacing.xs,
                          runSpacing: AppSpacing.xs,
                          children: [
                            if (c.caseTitle != null)
                              _CaseChip(title: c.caseTitle!, closed: c.closed)
                            else if (c.isDirect &&
                                c.counterpart.username != null)
                              // OQ-043: a direct chat is labelled with the
                              // @username.
                              _CaseChip(
                                // Owner 2026-09-30: my unanswered request.
                                title: c.myRequestPending
                                    ? '@${c.counterpart.username} · '
                                        '${t.t('chat.requests.sent')}'
                                    : '@${c.counterpart.username}',
                                closed: false,
                                icon: c.myRequestPending
                                    ? AppIcons.scheduleSendOutlined
                                    : AppIcons.personOutlineRounded,
                              ),
                            if (c.waiting)
                              _CaseChip(
                                key: ValueKey('chat-waiting-${c.id}'),
                                title: t.t('chat.waiting.chip', {
                                  'ago':
                                      SocialFormat.ago(t, f, c.waitingSince!),
                                }),
                                closed: false,
                                icon: AppIcons.hourglassTopRounded,
                              ),
                          ],
                        ),
                      ),
                      // Owner 2026-10-01: the time at the bottom right.
                      if (c.lastMessageAt != null) ...[
                        const SizedBox(width: AppSpacing.sm),
                        Text(
                          SocialFormat.ago(t, f, c.lastMessageAt!),
                          style: type.caption.copyWith(
                            color:
                                unread ? colors.goldDark : colors.textSecondary,
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CaseChip extends StatelessWidget {
  const _CaseChip({
    required this.title,
    required this.closed,
    this.icon,
    super.key,
  });

  final String title;
  final bool closed;

  /// Overrides the scales icon (direct chats).
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding:
          const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppIcon(
              icon ??
                  (closed
                      ? AppIcons.lockOutlineRounded
                      : AppIcons.balanceRounded),
              size: 12,
              color: colors.goldDark),
          const SizedBox(width: 4),
          Flexible(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(color: colors.goldDark),
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
  return p.displayName ?? (p.username == null ? '' : '@${p.username}');
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
          color: colors.goldTint,
          border: Border.all(color: colors.goldStroke),
        ),
        child: AppIcon(AppIcons.personOutlineRounded,
            color: colors.goldDark, size: size * 0.5),
      );
    }
    final name = counterpart.displayName ?? counterpart.username ?? '?';
    final avatar = GoldRingAvatar(
      url: counterpart.avatarUrl,
      initials: name.isEmpty ? '?' : name.substring(0, 1).toUpperCase(),
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
        child: SizedBox.square(
          dimension: AppSizes.touchTarget,
          child: Stack(
            alignment: Alignment.center,
            children: [
              AppIcon(
                selected
                    ? AppIcons.notificationsRounded
                    : AppIcons.notificationsNoneRounded,
                color: selected ? colors.gold : colors.text,
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
