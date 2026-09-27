import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';

enum ChecklistStatus { done, next, locked }

/// `/onboarding/verification` — «Верификация и подписка» (docs/01_
/// FOUNDATION_AUTH.md §11 Шаг 4B): a status checklist (profile ✔ →
/// license & identity verification → 7-day trial, which starts only AFTER
/// verification is approved, card via Stripe SetupIntent). "Verify now"
/// opens the verification entry (placeholder until file 03); "Later"
/// continues — the attorney then gets Feed/Search/Profile, and the Mine tab
/// shows a verification banner (guard row "attorney + unverified").
class AttorneyVerificationStepScreen extends ConsumerWidget {
  const AttorneyVerificationStepScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final action = ref.watch(onboardingActionsProvider);

    return OnboardingScaffold(
      step: OnboardingStepId.verification,
      title: t.t('onboarding.verification.title'),
      subtitle: t.t('onboarding.verification.subtitle'),
      onBack: () => context.go(OnboardingRoutes.forStep(OnboardingStepId.push)),
      error: action.error,
      primaryLabel: t.t('onboarding.verification.verifyNow'),
      onPrimary: () => context.push(AppRoutes.verification),
      secondary: AppButton(
        label: t.t('onboarding.verification.later'),
        variant: AppButtonVariant.secondary,
        isLoading: action.busy,
        onPressed: () => ref
            .read(onboardingActionsProvider.notifier)
            .advance(OnboardingStepId.verification),
      ),
      children: [
        VerificationChecklist(
          items: [
            (
              t.t('onboarding.verification.item.profile'),
              null,
              ChecklistStatus.done
            ),
            (
              t.t('onboarding.verification.item.license'),
              t.t('onboarding.verification.item.license.desc'),
              ChecklistStatus.next,
            ),
            (
              t.t('onboarding.verification.item.subscription'),
              t.t('onboarding.verification.item.subscription.desc'),
              ChecklistStatus.locked,
            ),
          ],
          statusLabels: {
            ChecklistStatus.done: t.t('onboarding.verification.status.done'),
            ChecklistStatus.next: t.t('onboarding.verification.status.next'),
            ChecklistStatus.locked:
                t.t('onboarding.verification.status.locked'),
          },
        ),
      ],
    );
  }
}

/// Vertical checklist with a connecting rail — also reused by the Mine
/// tab's verification banner.
class VerificationChecklist extends StatelessWidget {
  const VerificationChecklist(
      {required this.items, required this.statusLabels, super.key});

  final List<(String title, String? description, ChecklistStatus status)> items;
  final Map<ChecklistStatus, String> statusLabels;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    return AppCard(
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            MergeSemantics(
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Column(
                      children: [
                        _StatusDot(status: items[i].$3, index: i + 1),
                        if (i < items.length - 1)
                          Expanded(
                            child: Container(
                              width: 2,
                              margin: const EdgeInsets.symmetric(
                                  vertical: AppSpacing.xs),
                              color: items[i].$3 == ChecklistStatus.done
                                  ? colors.gold
                                  : colors.border,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                            bottom: i < items.length - 1 ? AppSpacing.xl : 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              items[i].$1,
                              style: typography.roleTitle.copyWith(
                                color: items[i].$3 == ChecklistStatus.locked
                                    ? colors.textSecondary
                                    : colors.text,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.xs),
                            Text(
                              statusLabels[items[i].$3]!,
                              style: typography.caption.copyWith(
                                color: switch (items[i].$3) {
                                  ChecklistStatus.done => colors.success,
                                  ChecklistStatus.next => colors.goldDark,
                                  ChecklistStatus.locked =>
                                    colors.textSecondary,
                                },
                              ),
                            ),
                            if (items[i].$2 != null) ...[
                              const SizedBox(height: AppSpacing.xs),
                              Text(
                                items[i].$2!,
                                style: typography.bodySmall
                                    .copyWith(color: colors.textSecondary),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.status, required this.index});

  final ChecklistStatus status;
  final int index;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (fill, border, child) = switch (status) {
      ChecklistStatus.done => (
          colors.gold,
          colors.gold,
          Icon(Icons.check_rounded, size: AppSizes.iconSm, color: colors.navy)
              as Widget,
        ),
      ChecklistStatus.next => (
          colors.goldTint,
          colors.gold,
          Text(index.toString(),
                  style: typography.caption.copyWith(color: colors.goldDark))
              as Widget,
        ),
      ChecklistStatus.locked => (
          colors.surface,
          colors.border,
          Icon(Icons.lock_outline_rounded,
              size: AppSpacing.lg, color: colors.textSecondary) as Widget,
        ),
    };
    return ExcludeSemantics(
      child: Container(
        width: AppSizes.rowMedallion - AppSpacing.sm,
        height: AppSizes.rowMedallion - AppSpacing.sm,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: fill,
          shape: BoxShape.circle,
          border: Border.all(color: border, width: 1.5),
        ),
        child: child,
      ),
    );
  }
}
