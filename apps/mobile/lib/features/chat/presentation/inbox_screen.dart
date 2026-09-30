import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/calls/presentation/call_log_entry.dart'
    show callLogKey;
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/shared/domain/user_role.dart';

enum InboxTab { chats, notifications, requests }

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
  late InboxTab _tab = widget.initialTab;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final badges = ref.watch(badgesProvider);
    final requests = ref.watch(messageRequestsCountProvider).value ?? 0;
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
                  _InboxTabs(
                    value: _tab,
                    counts: (badges.chats, badges.notifications, requests),
                    labels: (
                      t.t('inbox.tab.chats'),
                      t.t('inbox.tab.notifications'),
                      t.t('inbox.tab.requests'),
                    ),
                    onChanged: (v) => setState(() => _tab = v),
                  ),
                ],
              ),
            ),
            // Notification actions moved under the tabs.
            if (_tab == InboxTab.notifications)
              Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenSide),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    if (badges.notifications > 0)
                      TextButton(
                        onPressed: () =>
                            ref.read(notificationsProvider.notifier).markRead(),
                        child: Text(t.t('notif.markAllRead')),
                      ),
                    AppIconButton(
                      plain: true,
                      icon: Icon(Icons.tune_rounded, color: colors.text),
                      semanticLabel: t.t('settings.notifications'),
                      onPressed: () =>
                          context.push(ChatRoutes.notificationSettings),
                    ),
                  ],
                ),
              ),
            Expanded(
              child: IndexedStack(
                index: _tab.index,
                children: const [
                  ConversationsView(),
                  NotificationsView(),
                  MessageRequestsView(),
                ],
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
    required this.counts,
    required this.labels,
    required this.onChanged,
  });

  final InboxTab value;
  final (int, int, int) counts;
  final (String, String, String) labels;
  final ValueChanged<InboxTab> onChanged;

  static const _segment = 96.0;
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
            left: _segment * value.index,
            top: 0,
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
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              segment(InboxTab.chats, labels.$1, counts.$1),
              segment(InboxTab.notifications, labels.$2, counts.$2),
              segment(InboxTab.requests, labels.$3, counts.$3),
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
  return m.body.replaceAll(kContactMask, t.t('chat.masked'));
}

/// docs/05 §8.3 marker the server puts in place of a hidden contact.
const kContactMask = '[контакт скрыт]';

/// docs/05 §8.1 chats list.
class ConversationsView extends ConsumerWidget {
  const ConversationsView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final value = ref.watch(conversationsProvider);
    final n = ref.read(conversationsProvider.notifier);
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    return PagedListBody<Conversation>(
      value: value,
      t: t,
      itemKey: (c) => c.id,
      itemBuilder: (context, c, _) => ConversationRow(conversation: c),
      empty: AppEmptyState(
        icon: Icons.forum_outlined,
        title: t.t('chat.empty.title'),
        message: t.t(attorney ? 'chat.empty.attorney' : 'chat.empty.client'),
      ),
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
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
        icon: Icons.mark_email_read_outlined,
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
                      Flexible(
                        child: Text(
                          who,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.body.copyWith(
                            color: colors.text,
                            fontWeight:
                                unread ? FontWeight.w700 : FontWeight.w600,
                          ),
                        ),
                      ),
                      if (c.counterpart.verified) ...[
                        const SizedBox(width: 3),
                        VerifiedCheck(label: t.t('post.verified'), size: 14),
                      ],
                      if (c.muted) ...[
                        const SizedBox(width: AppSpacing.xs),
                        Icon(Icons.notifications_off_outlined,
                            size: 14, color: colors.textSecondary),
                      ],
                      const Spacer(),
                      if (c.lastMessageAt != null)
                        Text(
                          SocialFormat.ago(t, f, c.lastMessageAt!),
                          style: type.caption.copyWith(
                            color:
                                unread ? colors.goldDark : colors.textSecondary,
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
                  if (c.caseTitle != null) ...[
                    const SizedBox(height: AppSpacing.xs),
                    _CaseChip(title: c.caseTitle!, closed: c.closed),
                  ] else if (c.isDirect && c.counterpart.username != null) ...[
                    // OQ-043: a direct chat is labelled with the @username.
                    const SizedBox(height: AppSpacing.xs),
                    _CaseChip(
                      title: '@${c.counterpart.username}',
                      closed: false,
                      icon: c.myRequestPending
                          ? Icons.schedule_send_outlined
                          : Icons.person_outline_rounded,
                    ),
                  ],
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
  const _CaseChip({required this.title, required this.closed, this.icon});

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
          Icon(
              icon ??
                  (closed ? Icons.lock_outline_rounded : Icons.balance_rounded),
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
  const CounterpartAvatar(
      {required this.counterpart, required this.size, super.key});

  final Counterpart counterpart;
  final double size;

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
        child: Icon(Icons.person_outline_rounded,
            color: colors.goldDark, size: size * 0.5),
      );
    }
    final name = counterpart.displayName ?? counterpart.username ?? '?';
    return GoldRingAvatar(
      url: counterpart.avatarUrl,
      initials: name.isEmpty ? '?' : name.substring(0, 1).toUpperCase(),
      size: size,
      ring: counterpart.verified,
    );
  }
}
