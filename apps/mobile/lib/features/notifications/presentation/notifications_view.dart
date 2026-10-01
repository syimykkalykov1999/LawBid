import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/team/presentation/assistant_activity_list.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Where a notification (or its push) leads (docs/05 §9.2); null = no
/// target screen (a sheet with the text is shown instead).
String? notificationRoute({
  required String type,
  required Map<String, Object?> payload,
  required bool attorney,
  String? myId,
  String? actorUsername,
}) {
  String? s(String k) => payload[k] is String ? payload[k] as String : null;
  final caseId = s('caseId');
  final bidId = s('bidId');
  final postId = s('postId');
  switch (type) {
    case 'new_message' || 'missed_call' || 'incoming_call':
      final c = s('conversationId');
      return c == null ? ChatRoutes.inbox : ChatRoutes.conversation(c);
    case 'bid_received' ||
          'offer_countered' ||
          'offer_accepted' ||
          'bid_accepted' ||
          'bid_rejected' ||
          'negotiation_failed':
      if (bidId != null) return AppRoutes.bid(bidId);
      if (caseId == null) return null;
      return attorney ? AppRoutes.caseDetail(caseId) : AppRoutes.myCase(caseId);
    case 'case_updated' ||
          'case_stale_prompt' ||
          'case_archived' ||
          'completion_requested' ||
          'completion_reminder' ||
          'case_closed' ||
          'contact_issue_update':
      if (caseId == null) return null;
      return attorney ? AppRoutes.workCase(caseId) : AppRoutes.myCase(caseId);
    case 'review_requested':
      return caseId == null ? null : AppRoutes.reviewFormFor(caseId);
    // Owner 2026-09-30 (opt-in alerts).
    case 'followed_post':
      return postId == null ? null : SocialRoutes.post(postId);
    case 'new_case':
      return caseId == null ? null : AppRoutes.caseDetail(caseId);
    case 'review_received':
      return AppRoutes.profile;
    case 'new_follower':
      if (actorUsername != null) return AppRoutes.lawyer(actorUsername);
      return myId == null ? null : SocialRoutes.followers(myId);
    // OQ-034: comments under a case carry caseId instead of postId.
    case 'case_comment':
      return caseId == null ? null : AppRoutes.caseComments(caseId);
    case 'post_like' ||
          'post_comment' ||
          'comment_reply' ||
          'comment_like' ||
          'mention':
      if (postId == null && caseId != null) {
        return AppRoutes.caseComments(caseId);
      }
      return postId == null ? null : SocialRoutes.post(postId);
    case 'verification_update':
      return AppRoutes.verification;
    case 'subscription_trial_ending' ||
          'subscription_payment_failed' ||
          'subscription_status':
      return SubscriptionRoutes.subscription;
    case 'data_export_ready':
      return AppRoutes.dataExport;
    case 'case_history_export_ready':
      return AppRoutes.caseHistory;
    case 'security_new_device' || 'security_phone_changed':
      return AppRoutes.activeDevices;
    // OQ-048: Team requests → Inbox → Team; tasks / answers → Mine.
    case 'assistant_request' || 'assistant_joined':
      return ChatRoutes.inboxTab(InboxTab.team);
    case 'assistant_task' || 'assistant_result':
      return AppRoutes.mine;
  }
  return null;
}

/// The row text: the `notif.list.<type>` template with the actor's name
/// and, for aggregated rows, "and N more" (§9.4).
String notificationText(Translator t, AppNotification n) {
  // Owner 2026-09-30: a message from the LawBid team carries its own text.
  if (n.type == 'admin_broadcast') {
    final title = n.payload['title'];
    final body = n.payload['body'];
    return [
      if (title is String) title,
      if (body is String) body,
    ].join(' — ');
  }
  final name = n.actor?.displayName ?? '';
  final others = n.aggregateCount - 1;
  if (others > 0) {
    return t
        .t('notif.list.${n.type}.many', {'name': name, 'others': '$others'});
  }
  return t.t('notif.list.${n.type}', {'name': name});
}

IconData _icon(AppNotification n) => switch (n.type) {
      'post_like' || 'comment_like' => AppIcons.favoriteRounded,
      'post_comment' ||
      'comment_reply' ||
      'case_comment' =>
        AppIcons.modeCommentRounded,
      'new_follower' => AppIcons.personAddAlt1Rounded,
      // OQ-041.
      'missed_call' => AppIcons.phoneMissedRounded,
      // OQ-042.
      'mention' => AppIcons.alternateEmailRounded,
      'review_requested' || 'review_received' => AppIcons.starRounded,
      'security_new_device' => AppIcons.devicesRounded,
      'security_phone_changed' => AppIcons.phonelinkLockRounded,
      'verification_update' => AppIcons.verifiedRounded,
      'moderation_notice' => AppIcons.policyRounded,
      'assistant_request' => AppIcons.factCheckRounded,
      'admin_broadcast' => AppIcons.campaignRounded,
      'assistant_task' => AppIcons.eventNoteRounded,
      'assistant_joined' || 'assistant_result' => AppIcons.supportAgentRounded,
      _ => switch (n.category) {
          NotifCategory.bids => AppIcons.gavelRounded,
          NotifCategory.cases => AppIcons.folderRounded,
          NotifCategory.messages => AppIcons.chatBubbleRounded,
          NotifCategory.calls => AppIcons.callRounded,
          NotifCategory.following => AppIcons.dynamicFeedRounded,
          NotifCategory.newCases => AppIcons.workOutlineRounded,
          NotifCategory.system => AppIcons.shieldRounded,
          _ => AppIcons.notificationsRounded,
        },
    };

/// docs/05 §9.1 notifications: newest first, grouped "Сегодня", "На этой
/// неделе", "Раньше"; a gold dot marks unread; a tap opens the target and
/// marks the row read.
class NotificationsView extends ConsumerStatefulWidget {
  const NotificationsView({super.key});

  @override
  ConsumerState<NotificationsView> createState() => _NotificationsViewState();

  static String _group(DateTime at) {
    final now = DateTime.now();
    final d = at.toLocal();
    if (DateUtils.isSameDay(d, now)) return 'today';
    if (now.difference(d).inDays < 7) return 'week';
    return 'earlier';
  }
}

class _NotificationsViewState extends ConsumerState<NotificationsView> {
  /// Owner 2026-10-01: the assistants' activity lives under the bell.
  bool _assistants = false;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final team = ref.watch(currentUserRoleProvider) == UserRole.attorney &&
        !ref.watch(isAssistantProvider);
    final list =
        team && _assistants ? const AssistantActivityList() : _list(context, t);
    if (!team) return list;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Wrap(
            spacing: AppSpacing.sm,
            children: [
              AppChip(
                key: const ValueKey('notif-view-all'),
                label: t.t('notif.view.all'),
                selected: !_assistants,
                onTap: () => setState(() => _assistants = false),
              ),
              AppChip(
                key: const ValueKey('notif-view-assistants'),
                label: t.t('notif.view.assistants'),
                selected: _assistants,
                onTap: () => setState(() => _assistants = true),
              ),
            ],
          ),
        ),
        Expanded(child: list),
      ],
    );
  }

  Widget _list(BuildContext context, Translator t) {
    final value = ref.watch(notificationsProvider);
    final n = ref.read(notificationsProvider.notifier);
    return PagedListBody<AppNotification>(
      value: value,
      t: t,
      itemKey: (x) => x.id,
      itemBuilder: (context, x, i) {
        final items = value.value?.items ?? const <AppNotification>[];
        final group = NotificationsView._group(x.createdAt);
        final first =
            i == 0 || NotificationsView._group(items[i - 1].createdAt) != group;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (first) _GroupHeader(label: t.t('notif.group.$group')),
            _NotificationRow(n: x),
          ],
        );
      },
      empty: AppEmptyState(
        icon: AppIcons.notificationsNoneRounded,
        message: t.t('notif.empty'),
      ),
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm, bottom: AppSpacing.sm),
      child: Text(label,
          style: type.body
              .copyWith(color: colors.text, fontWeight: FontWeight.w700)),
    );
  }
}

class _NotificationRow extends ConsumerWidget {
  const _NotificationRow({required this.n});

  final AppNotification n;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final text = notificationText(t, n);
    return Semantics(
      button: true,
      label: '${n.unread ? '${t.t('notif.unread')}. ' : ''}$text',
      excludeSemantics: true,
      child: AppPressable(
        onTap: () {
          if (n.unread) {
            ref.read(notificationsProvider.notifier).markRead(id: n.id);
          }
          final route = notificationRoute(
            type: n.type,
            payload: n.payload,
            attorney: attorney,
            myId: ref.read(currentUserIdProvider),
            actorUsername: n.actor?.id == null ? null : n.actor?.username,
          );
          if (route != null) {
            context.push(route);
          } else {
            showAppBottomSheet<void>(
              context: context,
              builder: (_) => SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const AppSheetHandle(),
                      Text(text, style: type.body.copyWith(color: colors.text)),
                    ],
                  ),
                ),
              ),
            );
          }
        },
        // Owner 2026-10-01: the same card as the assistants' activity —
        // a navy medallion with a gold glyph (or the person's photo with
        // the glyph as a badge), the time on the right; unread = a gold
        // rule on the left and a gold dot.
        child: Container(
          margin: const EdgeInsets.only(bottom: AppSpacing.sm),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(
              color: n.unread ? colors.goldStroke : colors.border,
            ),
          ),
          clipBehavior: Clip.antiAlias,
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 3,
                  color: n.unread ? colors.gold : Colors.transparent,
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _Medallion(n: n),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Text(
                            text,
                            style: type.bodySmall.copyWith(
                              color: colors.text,
                              height: 1.35,
                              fontWeight:
                                  n.unread ? FontWeight.w600 : FontWeight.w400,
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Text(
                              SocialFormat.ago(t, f, n.createdAt),
                              style: type.caption
                                  .copyWith(color: colors.textSecondary),
                            ),
                            if (n.unread) ...[
                              const SizedBox(height: 6),
                              Container(
                                width: 8,
                                height: 8,
                                decoration: BoxDecoration(
                                  color: colors.gold,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The navy glyph medallion, or the actor's photo with the glyph badge.
class _Medallion extends StatelessWidget {
  const _Medallion({required this.n});

  final AppNotification n;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final glyph = Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: colors.navy,
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border.all(color: colors.goldStroke),
      ),
      child: AppIcon(_icon(n), size: 20, color: colors.gold),
    );
    final actor = n.actor;
    if (actor?.avatarUrl == null) return glyph;
    return SizedBox(
      width: 44,
      height: 44,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          GoldRingAvatar(
            url: actor!.avatarUrl,
            initials: actor.displayName.isEmpty
                ? '?'
                : actor.displayName.substring(0, 1).toUpperCase(),
            size: 40,
          ),
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                color: colors.navy,
                shape: BoxShape.circle,
                border: Border.all(color: colors.surface, width: 2),
              ),
              child: AppIcon(_icon(n), size: 11, color: colors.gold),
            ),
          ),
        ],
      ),
    );
  }
}
