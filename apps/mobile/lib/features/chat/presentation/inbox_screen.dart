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
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/shared/domain/user_role.dart';

enum InboxTab { chats, notifications }

/// The screen behind the Chats icon (docs/05 §8.1, §9.1): "Чаты |
/// Уведомления", each tab with its own unread count.
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
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        // Owner 2026-09-29: no "Messages" title; the tabs say it.
        actions: [
          if (_tab == InboxTab.notifications && badges.notifications > 0)
            TextButton(
              onPressed: () =>
                  ref.read(notificationsProvider.notifier).markRead(),
              child: Text(t.t('notif.markAllRead')),
            ),
          if (_tab == InboxTab.notifications)
            AppIconButton(
              plain: true,
              icon: Icon(Icons.tune_rounded, color: colors.text),
              semanticLabel: t.t('settings.notifications'),
              onPressed: () => context.push(ChatRoutes.notificationSettings),
            ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.screenSide, vertical: AppSpacing.sm),
            child: _InboxTabs(
              value: _tab,
              chats: badges.chats,
              notifications: badges.notifications,
              labels: (t.t('inbox.tab.chats'), t.t('inbox.tab.notifications')),
              onChanged: (v) => setState(() => _tab = v),
            ),
          ),
          Expanded(
            child: IndexedStack(
              index: _tab.index,
              children: const [
                ConversationsView(),
                NotificationsView(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Two segments with a gliding gold-bordered indicator and count pills.
class _InboxTabs extends StatelessWidget {
  const _InboxTabs({
    required this.value,
    required this.chats,
    required this.notifications,
    required this.labels,
    required this.onChanged,
  });

  final InboxTab value;
  final int chats;
  final int notifications;
  final (String, String) labels;
  final ValueChanged<InboxTab> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final d = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    Widget segment(InboxTab tab, String label, int count) {
      final selected = tab == value;
      return Expanded(
        child: Semantics(
          button: true,
          selected: selected,
          label: count > 0 ? '$label, $count' : label,
          excludeSemantics: true,
          child: AppPressable(
            onTap: () => onChanged(tab),
            child: SizedBox(
              height: AppSizes.touchTarget,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AnimatedDefaultTextStyle(
                    duration: d,
                    style: type.body.copyWith(
                      color: selected ? colors.onAccent : colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                    child: Text(label),
                  ),
                  if (count > 0) ...[
                    const SizedBox(width: AppSpacing.xs),
                    CountPill(count: count),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: colors.border),
      ),
      child: Stack(
        children: [
          AnimatedAlign(
            duration: d,
            curve: AppMotion.enterCurve,
            alignment: value == InboxTab.chats
                ? Alignment.centerLeft
                : Alignment.centerRight,
            child: FractionallySizedBox(
              widthFactor: 0.5,
              child: Container(
                height: AppSizes.touchTarget,
                decoration: BoxDecoration(
                  color: colors.accent,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                  border: Border.all(color: colors.goldStroke),
                ),
              ),
            ),
          ),
          Row(
            children: [
              segment(InboxTab.chats, labels.$1, chats),
              segment(InboxTab.notifications, labels.$2, notifications),
            ],
          ),
        ],
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
String messagePreview(Translator t, ChatMessage m) {
  if (m.kind == MessageKind.system) return t.t('chat.system.${m.body}');
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
      itemBuilder: (context, c, _) => _ConversationRow(conversation: c),
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

class _ConversationRow extends ConsumerWidget {
  const _ConversationRow({required this.conversation});

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
                                  '${messagePreview(t, last)}',
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
  const _CaseChip({required this.title, required this.closed});

  final String title;
  final bool closed;

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
          Icon(closed ? Icons.lock_outline_rounded : Icons.balance_rounded,
              size: 12, color: colors.goldDark),
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
