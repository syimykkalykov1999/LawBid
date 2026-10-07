import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/case_payments/case_payments_routes.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/presentation/assistant_activity_list.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid/features/trust/trust_routes.dart';
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
  // ignore: cast_nullable_to_non_nullable
  String? s(String k) => payload[k] is String ? payload[k] as String : null;
  final caseId = s('caseId');
  final bidId = s('bidId');
  final postId = s('postId');
  switch (type) {
    case 'new_message' || 'missed_call' || 'incoming_call':
      final c = s('conversationId');
      return c == null ? ChatRoutes.inbox : ChatRoutes.conversation(c);
    // Owner 2026-10-06: an accepted bid opens the chat with that person,
    // where the system message says so.
    case 'offer_accepted' || 'bid_accepted' when s('conversationId') != null:
      return ChatRoutes.conversation(s('conversationId')!);
    // Audit 2026-10-04: the hired attorney lands on the work card, not on
    // the bid / public case card (which loop into each other).
    case 'offer_accepted' || 'bid_accepted' when attorney && caseId != null:
      return AppRoutes.workCase(caseId);
    case 'bid_received' ||
          'offer_countered' ||
          'offer_accepted' ||
          'bid_accepted' ||
          'bid_rejected' ||
          'negotiation_failed':
      if (bidId != null) return AppRoutes.bid(bidId);
      if (caseId == null) return null;
      return attorney ? AppRoutes.caseDetail(caseId) : AppRoutes.myCase(caseId);
    // Audit 2026-10-04: updates of a case go to its card; the work card is
    // only for completion / closing.
    case 'case_updated' || 'case_archived':
      if (caseId == null) return null;
      return attorney ? AppRoutes.caseDetail(caseId) : AppRoutes.myCase(caseId);
    case 'case_disputed' || 'dispute_resolved':
      if (caseId == null) return null;
      return attorney ? AppRoutes.workCase(caseId) : AppRoutes.myCase(caseId);
    case 'case_stale_prompt' ||
          'completion_requested' ||
          'completion_reminder' ||
          'case_closed' ||
          'contact_issue_update':
      if (caseId == null) return null;
      return attorney ? AppRoutes.workCase(caseId) : AppRoutes.myCase(caseId);
    // Owner 2026-10-05: a client offered a case / an attorney declined.
    case 'case_invite_received':
      return AppRoutes.invites;
    case 'case_invite_declined':
      return caseId == null ? null : AppRoutes.myCase(caseId);
    case 'review_requested':
      return caseId == null ? null : AppRoutes.reviewFormFor(caseId);
    // Owner 2026-09-30 (opt-in alerts).
    case 'followed_post':
      return postId == null ? null : SocialRoutes.post(postId);
    case 'new_case' || 'new_urgent_case':
      return caseId == null ? null : AppRoutes.caseDetail(caseId);
    // Owner 2026-10-05: a case's date (court hearing…) is near, today,
    // passed, or was moved by the other side.
    case 'case_deadline_soon' ||
          'case_deadline_today' ||
          'case_deadline_passed' ||
          'case_deadline_changed':
      if (caseId == null) return null;
      return attorney ? AppRoutes.workCase(caseId) : AppRoutes.myCase(caseId);
    // Audit 2026-10-04: the attorney answered the client's review.
    case 'review_received'
        when _flag(payload['reply']) &&
            !_flag(payload['clientReview']) &&
            (s('actorUsername') ?? actorUsername) != null:
      return AppRoutes.lawyer((s('actorUsername') ?? actorUsername)!);
    case 'review_received':
      return AppRoutes.profile;
    case 'new_follower':
      if (actorUsername != null) return AppRoutes.lawyer(actorUsername);
      return myId == null ? null : SocialRoutes.followers(myId);
    // OQ-034: comments under a case carry caseId instead of postId.
    case 'case_comment':
      return caseId == null ? null : AppRoutes.caseComments(caseId);
    case 'post_like' ||
          'post_repost' ||
          'post_comment' ||
          'comment_reply' ||
          'comment_like' ||
          'mention':
      if (postId == null && caseId != null) {
        return AppRoutes.caseComments(caseId);
      }
      return postId == null ? null : SocialRoutes.post(postId);
    case 'verification_update':
      // Owner 2026-10-05: trust level changes / holds open the attorney's
      // own trust screen.
      if (isTrustNotificationKind(s('kind'))) {
        return attorney ? TrustRoutes.me : AppRoutes.verification;
      }
      // Owner 2026-10-02: a client's gold badge request.
      return s('kind') == 'client_badge'
          ? AppRoutes.clientBadge
          : AppRoutes.verification;
    // Admin growth features (2026-10-02).
    case 'admin_broadcast':
      final ticketId = s('ticketId');
      return ticketId == null ? null : AppRoutes.supportTicket(ticketId);
    case 'referral_reward':
      return AppRoutes.referral;
    case 'partner_commission' ||
          'partner_payout' ||
          'partner_approved' ||
          'partner_declined':
      return AppRoutes.partner;
    case 'promotion_started' || 'promotion_ended':
      if (caseId != null) return AppRoutes.myCase(caseId);
      // Owner 2026-10-05: a promoted post → "My promotions".
      return AppRoutes.myPromotions;
    // Owner 2026-10-05: client → attorney payments.
    case 'case_payment_received' || 'case_payment_disputed':
      if (caseId == null) return CasePaymentsRoutes.history;
      return AppRoutes.workCase(caseId);
    case 'case_payment_sent' ||
          'case_payment_refunded' ||
          'payment_request_created' ||
          'payment_request_due' ||
          'payment_request_overdue' ||
          'payment_request_canceled' ||
          'payment_fee_countered' ||
          'payment_fee_agreed':
      if (caseId == null) return CasePaymentsRoutes.history;
      return AppRoutes.myCase(caseId);
    case 'payout_account_status':
      return CasePaymentsRoutes.payoutAccount;
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
    case 'assistant_request':
      return ChatRoutes.inboxTab(InboxTab.team);
    case 'assistant_joined':
      return TeamRoutes.team;
    case 'assistant_task' || 'assistant_result':
      return AppRoutes.mine;
    // Owner 2026-10-05: the planner — a reminder or a task given to me
    // opens the planner; "removed soon" opens the archive.
    case 'task_reminder' || 'task_assigned':
      return AppRoutes.mine;
    case 'task_purge_soon':
      return TeamRoutes.tasksArchive;
  }
  return null;
}

/// `verification_update` payload kinds of the trust module (apps/api
/// attorney-trust.constants.ts TRUST_NOTIFICATION_KIND).
const trustNotificationKinds = <String>{
  'trust_level_up',
  'trust_payments_paused',
  'trust_payments_resumed',
  'trust_bids_paused',
  'trust_hold_lifted',
  'trust_documents_requested',
  'trust_auto_suspended',
  'trust_firm_link_required',
  'trust_firm_link_confirmed',
  'trust_cleared',
  'trust_requirements_changed',
};

bool isTrustNotificationKind(String? kind) =>
    kind != null && trustNotificationKinds.contains(kind);

/// Owner 2026-10-07 (phone test): `verification_update` kinds of the
/// verification module (apps/api VERIFICATION_NOTIFICATION_KIND and the
/// license jobs) — each row says what happened, never just «changed».
const verificationNotificationKinds = {
  'in_review',
  'needs_more_info',
  'approved',
  'self_attested',
  'rejected',
  'suspended',
  'restored',
  'license_expiring',
  'license_expired',
  'profile_unverified',
};

/// A payload flag; push data carries every value as a string.
bool _flag(Object? v) => v == true || v == 'true';

/// The row text: the `notif.list.<type>` template with the actor's name
/// and, for aggregated rows, "and N more" (§9.4).
String notificationText(Translator t, AppNotification n) {
  // Owner 2026-09-30: a message from the LawBid team carries its own text.
  if (n.type == 'admin_broadcast' && n.payload['kind'] == 'support_reply') {
    return t.t('notif.list.support_reply');
  }
  if (n.type == 'verification_update' && n.payload['kind'] == 'client_badge') {
    final st = n.payload['status'];
    return t.t(
      st == 'badge_on'
          ? 'notif.list.cbadge.on'
          : st == 'approved'
              ? 'notif.list.cbadge.approved'
              : st == 'rejected'
                  ? 'notif.list.cbadge.rejected'
                  : 'notif.list.cbadge.off',
    );
  }
  // Owner 2026-10-05: attorney trust levels — `notif.verification.<kind>`.
  if (n.type == 'verification_update') {
    final kind = n.payload['kind'];
    if (kind is String && verificationNotificationKinds.contains(kind)) {
      final key = kind == 'approved' && _flag(n.payload['partial'])
          ? 'approved_partial'
          : kind;
      String? str(String k) {
        final v = n.payload[k];
        return v is String || v is num ? '$v' : null;
      }

      return t.t('notif.verification.$key', {
        'message': str('message') ?? '',
        'state': str('stateCode') ?? '',
        'date': str('expiresAt') ?? '',
      });
    }
    if (kind is String && isTrustNotificationKind(kind)) {
      final base = t.t('notif.verification.$kind');
      // Staff asked for documents: say which (template) and their note.
      if (kind == 'trust_documents_requested') {
        final template = n.payload['template'];
        final note = n.payload['note'];
        final hasNote = note is String && note.trim().isNotEmpty;
        final detail = template == 'custom' && !hasNote
            ? t.t('trust.docs.custom.noNote')
            : t.t(
                documentRequestTextKey(template is String ? template : null),
                {'note': hasNote ? note.trim() : ''},
              );
        return '$base $detail';
      }
      return base;
    }
  }
  if (n.type == 'review_received' && _flag(n.payload['reply'])) {
    return t.t(
      _flag(n.payload['clientReview'])
          ? 'notif.list.client_review_reply'
          : 'notif.list.review_reply',
    );
  }
  if (n.type == 'subscription_status') {
    final k = n.payload['kind'];
    if (k == 'contract' || k == 'contract_revoked') {
      return t.t('notif.list.subscription_status.$k');
    }
    // Owner 2026-10-05: the admin answered a request for more assistants.
    if (k == 'seat_limit_approved' || k == 'seat_limit_rejected') {
      return t.t(
        'notif.list.subscription_status.$k',
        {'seats': '${n.payload['seats'] ?? ''}'},
      );
    }
  }
  if (n.type == 'admin_broadcast') {
    final title = n.payload['title'];
    final body = n.payload['body'];
    return [
      if (title is String) title,
      if (body is String) body,
    ].join(' — ');
  }
  // Owner 2026-10-05: "N days until the case's date".
  if (n.type == 'case_deadline_soon') {
    final days = n.payload['days'];
    return days is num
        ? t.plural('notif.list.case_deadline_soon', days)
        : t.t('notif.list.case_deadline_today', {'name': ''});
  }
  // Owner 2026-10-05: "N finished tasks will be removed in D days".
  if (n.type == 'task_purge_soon') {
    return t.t('notif.list.task_purge_soon', {
      'count': '${n.payload['count'] ?? ''}',
      'days': '${n.payload['days'] ?? ''}',
    });
  }
  // Audit 2026-10-02: a moderation notice shows the moderator's reason.
  if (n.type == 'moderation_notice') {
    final reason = n.payload['reason'];
    final base = t.t('notif.list.moderation_notice', {'name': ''});
    return reason is String && reason.trim().isNotEmpty
        ? '$base: ${reason.trim()}'
        : base;
  }
  final name = n.actor?.displayName ?? '';
  final others = n.aggregateCount - 1;
  if (others > 0) {
    final key = 'notif.list.${n.type}.many';
    final text = t.t(key, {'name': name, 'others': '$others'});
    if (text != key) return text;
  }
  final key = 'notif.list.${n.type}';
  final text = t.t(key, {'name': name});
  // Owner 2026-10-06: never a raw key on screen (a type the app has no
  // text for yet).
  return text == key ? t.t('notif.list.generic') : text;
}

IconData _icon(AppNotification n) => switch (n.type) {
      'post_like' || 'comment_like' => AppIcons.favoriteRounded,
      'post_comment' ||
      'comment_reply' ||
      'case_comment' =>
        AppIcons.modeCommentRounded,
      // Owner 2026-10-07: Threads-style reposts.
      'post_repost' => AppIcons.autoModeRounded,
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
      'referral_reward' => AppIcons.starRounded,
      'partner_commission' ||
      'partner_payout' ||
      'partner_approved' ||
      'partner_declined' =>
        AppIcons.handshakeOutlined,
      'promotion_started' || 'promotion_ended' => AppIcons.campaignOutlined,
      'case_payment_received' ||
      'case_payment_sent' ||
      'case_payment_refunded' ||
      'payment_request_created' ||
      'payment_request_canceled' =>
        AppIcons.paymentsOutlined,
      'payment_fee_countered' ||
      'payment_fee_agreed' =>
        AppIcons.handshakeOutlined,
      'payment_request_due' ||
      'payment_request_overdue' =>
        AppIcons.scheduleRounded,
      'case_payment_disputed' => AppIcons.errorOutlineRounded,
      'payout_account_status' => AppIcons.accountBalanceOutlined,
      'assistant_task' || 'task_assigned' => AppIcons.eventNoteRounded,
      'task_reminder' => AppIcons.notificationsActiveOutlined,
      'task_purge_soon' => AppIcons.inventory2Outlined,
      'assistant_joined' || 'assistant_result' => AppIcons.supportAgentRounded,
      'case_deadline_soon' ||
      'case_deadline_today' ||
      'case_deadline_passed' ||
      'case_deadline_changed' =>
        AppIcons.eventOutlined,
      'new_urgent_case' => AppIcons.timerOutlined,
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
  const NotificationsView({this.trailing, this.onInboxTab, super.key});

  /// Actions at the right of the filter line (mark all read, settings).
  final Widget? trailing;

  /// Shown inside the Inbox: a target that is an Inbox tab switches to it
  /// instead of pushing a second Inbox.
  final ValueChanged<InboxTab>? onInboxTab;

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
    final group = ref.watch(notificationGroupProvider);
    final list =
        team && _assistants ? const AssistantActivityList() : _list(context, t);
    final trailing = widget.trailing;

    // Owner 2026-10-06: All · Important · Other (· Assistants).
    void pick(NotifGroup? g, {bool assistants = false}) {
      setState(() => _assistants = assistants);
      if (!assistants) ref.read(notificationGroupProvider.notifier).set(g);
    }

    Widget chip(
      String key,
      String label, {
      required bool selected,
      required VoidCallback onTap,
    }) =>
        Padding(
          padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
          child: AppChip(
            key: ValueKey(key),
            label: label,
            selected: selected,
            onTap: onTap,
          ),
        );

    return Column(
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            0,
            0,
            AppSpacing.xs,
            AppSpacing.sm,
          ),
          child: Row(
            children: [
              // Scrolls sideways: long labels in some languages never
              // squeeze "Mark all read".
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsetsDirectional.only(
                    start: AppSpacing.screenSide,
                  ),
                  child: Row(
                    children: [
                      chip(
                        'notif-view-all',
                        t.t('notif.view.all'),
                        selected: !_assistants && group == null,
                        onTap: () => pick(null),
                      ),
                      chip(
                        'notif-view-important',
                        t.t('notif.view.important'),
                        selected: !_assistants && group == NotifGroup.important,
                        onTap: () => pick(NotifGroup.important),
                      ),
                      chip(
                        'notif-view-other',
                        t.t('notif.view.other'),
                        selected: !_assistants && group == NotifGroup.other,
                        onTap: () => pick(NotifGroup.other),
                      ),
                      if (team)
                        chip(
                          'notif-view-assistants',
                          t.t('notif.view.assistants'),
                          selected: _assistants,
                          onTap: () => pick(null, assistants: true),
                        ),
                    ],
                  ),
                ),
              ),
              if (trailing != null) trailing,
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
            _NotificationRow(n: x, onInboxTab: widget.onInboxTab),
          ],
        );
      },
      empty: AppEmptyState(
        icon: AppIcons.notificationsNoneRounded,
        message: t.t(
          switch (ref.watch(notificationGroupProvider)) {
            NotifGroup.important => 'notif.empty.important',
            NotifGroup.other => 'notif.empty.other',
            null => 'notif.empty',
          },
        ),
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
      child: Text(
        label,
        style:
            type.body.copyWith(color: colors.text, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _NotificationRow extends ConsumerWidget {
  const _NotificationRow({required this.n, this.onInboxTab});

  final AppNotification n;
  final ValueChanged<InboxTab>? onInboxTab;

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
          final inboxTab = onInboxTab == null
              ? null
              : InboxTab.values
                  .where((v) => route == ChatRoutes.inboxTab(v))
                  .firstOrNull;
          if (inboxTab != null) {
            onInboxTab!(inboxTab);
          } else if (route != null) {
            context.push(route);
          } else {
            showAppBottomSheet<void>(
              context: context,
              builder: (_) => SafeArea(
                // Scrolls: a long broadcast must not overflow the sheet.
                child: SingleChildScrollView(
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
                        // Capped: a long localized "x ago" can't squeeze the
                        // notification text.
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 88),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                SocialFormat.ago(t, f, n.createdAt),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.end,
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
                : avatarInitials(actor.displayName),
            size: 40,
          ),
          PositionedDirectional(
            end: -2,
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
