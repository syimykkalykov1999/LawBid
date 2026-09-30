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
    case 'security_new_device':
      return AppRoutes.activeDevices;
  }
  return null;
}

/// The row text: the `notif.list.<type>` template with the actor's name
/// and, for aggregated rows, "and N more" (§9.4).
String notificationText(Translator t, AppNotification n) {
  final name = n.actor?.displayName ?? '';
  final others = n.aggregateCount - 1;
  if (others > 0) {
    return t
        .t('notif.list.${n.type}.many', {'name': name, 'others': '$others'});
  }
  return t.t('notif.list.${n.type}', {'name': name});
}

IconData _icon(AppNotification n) => switch (n.type) {
      'post_like' || 'comment_like' => Icons.favorite_rounded,
      'post_comment' ||
      'comment_reply' ||
      'case_comment' =>
        Icons.mode_comment_rounded,
      'new_follower' => Icons.person_add_alt_1_rounded,
      // OQ-041.
      'missed_call' => Icons.phone_missed_rounded,
      // OQ-042.
      'mention' => Icons.alternate_email_rounded,
      'review_requested' || 'review_received' => Icons.star_rounded,
      'security_new_device' => Icons.devices_rounded,
      'verification_update' => Icons.verified_rounded,
      'moderation_notice' => Icons.policy_rounded,
      _ => switch (n.category) {
          NotifCategory.bids => Icons.gavel_rounded,
          NotifCategory.cases => Icons.folder_rounded,
          NotifCategory.messages => Icons.chat_bubble_rounded,
          NotifCategory.system => Icons.shield_rounded,
          _ => Icons.notifications_rounded,
        },
    };

/// docs/05 §9.1 notifications: newest first, grouped "Сегодня", "На этой
/// неделе", "Раньше"; a gold dot marks unread; a tap opens the target and
/// marks the row read.
class NotificationsView extends ConsumerWidget {
  const NotificationsView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final value = ref.watch(notificationsProvider);
    final n = ref.read(notificationsProvider.notifier);
    return PagedListBody<AppNotification>(
      value: value,
      t: t,
      itemKey: (x) => x.id,
      itemBuilder: (context, x, i) {
        final items = value.value?.items ?? const <AppNotification>[];
        final group = _group(x.createdAt);
        final first = i == 0 || _group(items[i - 1].createdAt) != group;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (first) _GroupHeader(label: t.t('notif.group.$group')),
            _NotificationRow(n: x),
          ],
        );
      },
      empty: AppEmptyState(
        icon: Icons.notifications_none_rounded,
        message: t.t('notif.empty'),
      ),
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
    );
  }

  static String _group(DateTime at) {
    final now = DateTime.now();
    final d = at.toLocal();
    if (DateUtils.isSameDay(d, now)) return 'today';
    if (now.difference(d).inDays < 7) return 'week';
    return 'earlier';
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
          style: type.bodySmall.copyWith(
              color: colors.textSecondary, fontWeight: FontWeight.w600)),
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
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: n.unread ? colors.goldTint : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border:
                Border.all(color: n.unread ? colors.goldStroke : colors.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (n.actor?.avatarUrl != null)
                GoldRingAvatar(
                  url: n.actor!.avatarUrl,
                  initials: n.actor!.displayName.isEmpty
                      ? '?'
                      : n.actor!.displayName.substring(0, 1).toUpperCase(),
                  size: 44,
                )
              else
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.accent,
                  ),
                  child: Icon(_icon(n), size: 20, color: colors.gold),
                ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(text,
                        style: type.bodySmall.copyWith(
                          color: colors.text,
                          fontWeight:
                              n.unread ? FontWeight.w600 : FontWeight.w400,
                        )),
                    const SizedBox(height: 2),
                    Text(SocialFormat.ago(t, f, n.createdAt),
                        style:
                            type.caption.copyWith(color: colors.textSecondary)),
                  ],
                ),
              ),
              if (n.unread)
                Container(
                  width: 9,
                  height: 9,
                  margin: const EdgeInsets.only(top: 6, left: AppSpacing.sm),
                  decoration:
                      BoxDecoration(color: colors.gold, shape: BoxShape.circle),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
