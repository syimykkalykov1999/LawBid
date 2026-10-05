import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/invites_providers.dart';
import 'package:lawbid/features/cases/domain/case_invite.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_dossier.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Owner 2026-10-05: the attorney's invites from clients waiting for an
/// answer — reply with a bid (prefilled with the client's budget), open
/// the case, or decline with an optional reason.
class InvitesList extends ConsumerWidget {
  const InvitesList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final invites = ref.watch(pendingInvitesProvider);
    return invites.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => AppEmptyState(
        message: errorText(t, e),
        action: AppButton(
          label: t.t('common.retry'),
          variant: AppButtonVariant.secondary,
          onPressed: () => ref.invalidate(pendingInvitesProvider),
        ),
      ),
      data: (items) => items.isEmpty
          ? AppEmptyState(
              key: const ValueKey('invites-empty'),
              title: t.t('invites.empty'),
              message: t.t('invites.empty.body'),
            )
          : RefreshIndicator(
              onRefresh: () => ref.refresh(pendingInvitesProvider.future),
              child: ListView.separated(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.xl,
                ),
                itemCount: items.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(height: AppSpacing.md),
                itemBuilder: (_, i) => InviteCard(invite: items[i]),
              ),
            ),
    );
  }
}

class InviteCard extends ConsumerStatefulWidget {
  const InviteCard({required this.invite, super.key});

  final CaseInvite invite;

  @override
  ConsumerState<InviteCard> createState() => _InviteCardState();
}

class _InviteCardState extends ConsumerState<InviteCard> {
  bool _busy = false;

  Future<void> _decline() async {
    final t = ref.read(translatorProvider);
    final reason = await showDialog<String>(
      context: context,
      builder: (_) => const _DeclineDialog(),
    );
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(invitesRepositoryProvider).decline(
            widget.invite.id,
            reason: reason.trim().isEmpty ? null : reason.trim(),
          );
      if (!mounted) return;
      showAppSnackBar(context, t.t('invites.declined'));
      ref.invalidate(pendingInvitesProvider);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _answer() async {
    final i = widget.invite;
    // Like the case's bid button: no subscription → the offer first.
    if (ref.read(currentUserRoleProvider) == UserRole.attorney) {
      final overview = await ref
          .read(subscriptionOverviewProvider.future)
          .then<SubscriptionOverview?>((o) => o, onError: (Object _) => null);
      if (!mounted) return;
      if (overview != null && !overview.isActive) {
        await context.push(AppRoutes.subscriptionRequiredFor('bid'));
        return;
      }
    }
    if (!mounted) return;
    await context.push(AppRoutes.placeBid(i.caseId), extra: i.budgetCents);
    // A sent bid marks the invite accepted on the server.
    if (mounted) ref.invalidate(pendingInvitesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final i = widget.invite;
    final practice = t.t(i.casePracticeKey);
    final states = i.caseStateCodes.join(', ');
    return Container(
      key: ValueKey('invite-${i.id}'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            i.caseTitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: type.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: 2),
          Text(
            [
              if (practice != i.casePracticeKey) practice,
              if (states.isNotEmpty) states,
            ].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            i.budgetCents == null
                ? t.t('invites.noBudget')
                : t.t('invites.budget', {
                    'amount': CaseFormat.money(formats, i.budgetCents!),
                  }),
            style: type.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (i.message != null && i.message!.trim().isNotEmpty) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('invites.clientNote'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
            Text(
              i.message!,
              maxLines: 6,
              overflow: TextOverflow.ellipsis,
              style: type.body.copyWith(color: colors.text),
            ),
          ],
          // Owner 2026-10-05: the case file before answering, with the rule
          // that the files open once the client accepts.
          const SizedBox(height: AppSpacing.sm),
          CaseDossierPanel(
            key: ValueKey('invite-dossier-${i.id}'),
            score: CaseDossierScore.fromFields(
              dossier: i.caseDossier,
              city: i.caseCity,
              urgency: i.caseUrgency,
              budget: i.caseBudget,
            ),
            status: CaseStatus.open,
            t: t,
            rule: CaseDossierRule.offer,
          ),
          if (i.outsideLicensedStates || i.outsidePractice) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              [
                if (i.outsideLicensedStates) t.t('invite.mismatch.state'),
                if (i.outsidePractice) t.t('invite.mismatch.practice'),
              ].join('\n'),
              style: type.bodySmall.copyWith(color: colors.goldDark),
            ),
          ],
          const SizedBox(height: AppSpacing.sm),
          Text(
            t.t('invites.expires', {'date': formats.date(i.expiresAt)}),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            key: ValueKey('invite-answer-${i.id}'),
            label: t.t('invites.answer'),
            height: 44,
            isEnabled: !_busy,
            onPressed: _answer,
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  key: ValueKey('invite-open-${i.id}'),
                  label: t.t('invites.open'),
                  variant: AppButtonVariant.secondary,
                  height: 40,
                  isEnabled: !_busy,
                  onPressed: () => context.push(AppRoutes.caseDetail(i.caseId)),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton(
                  key: ValueKey('invite-decline-${i.id}'),
                  label: t.t('invites.decline'),
                  variant: AppButtonVariant.secondary,
                  height: 40,
                  isLoading: _busy,
                  isEnabled: !_busy,
                  onPressed: _decline,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Returns the reason ('' for none), or null when cancelled.
class _DeclineDialog extends ConsumerStatefulWidget {
  const _DeclineDialog();

  @override
  ConsumerState<_DeclineDialog> createState() => _DeclineDialogState();
}

class _DeclineDialogState extends ConsumerState<_DeclineDialog> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return AlertDialog(
      backgroundColor: colors.surface,
      title: Text(t.t('invites.decline.title')),
      content: AppTextField(
        key: const ValueKey('invite-decline-reason'),
        controller: _reason,
        hintText: t.t('invites.decline.reason'),
        maxLines: 3,
        maxLength: 500,
        textCapitalization: TextCapitalization.sentences,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(t.t('common.cancel')),
        ),
        TextButton(
          key: const ValueKey('invite-decline-confirm'),
          onPressed: () => Navigator.of(context).pop(_reason.text),
          child: Text(
            t.t('invites.decline.confirm'),
            style: TextStyle(color: colors.dangerText),
          ),
        ),
      ],
    );
  }
}
