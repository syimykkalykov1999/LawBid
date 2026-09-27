import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// `/onboarding/push` — push-permission explainer (docs/01_FOUNDATION_AUTH
/// .md §11 Шаг 3A/3B: "объяснение зачем, затем системный запрос").
///
/// This stage ships the explainer only: FCM/APNs registration and the OS
/// permission prompt arrive with notifications (TODO(file 05 §notifications):
/// request the system permission + register the device token on "Allow").
/// The user's choice is saved as step data (`pushOptIn`) so that later
/// stage can prompt exactly the users who said yes here.
class PushStepScreen extends ConsumerWidget {
  const PushStepScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final action = ref.watch(onboardingActionsProvider);
    final attorney = ref.watch(currentUserRoleProvider.select((r) => r == UserRole.attorney));
    final variant = attorney ? 'attorney' : 'client';

    void choose({required bool optIn}) => ref
        .read(onboardingActionsProvider.notifier)
        .advance(OnboardingStepId.push, {'pushOptIn': optIn});

    final benefits = [
      (Icons.gavel_rounded, t.t('onboarding.push.benefit1.$variant')),
      (Icons.chat_bubble_outline_rounded, t.t('onboarding.push.benefit2')),
      (Icons.event_available_rounded, t.t('onboarding.push.benefit3')),
    ];

    return OnboardingScaffold(
      step: OnboardingStepId.push,
      title: t.t('onboarding.push.title'),
      subtitle: t.t('onboarding.push.subtitle'),
      onBack: () => context.go(OnboardingRoutes.forStep(OnboardingStepId.profile)),
      error: action.error,
      primaryLabel: t.t('onboarding.push.allow'),
      primaryLoading: action.busy,
      onPrimary: () => choose(optIn: true),
      secondary: AppButton(
        label: t.t('onboarding.push.later'),
        variant: AppButtonVariant.secondary,
        onPressed: action.busy ? null : () => choose(optIn: false),
      ),
      children: [
        const Center(
          child: AppEntrance(
            scale: true,
            child: AppIconMedallion(
              icon: Icons.notifications_active_outlined,
              size: AppSizes.stateMedallion,
              iconSize: AppSizes.stateIcon,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        for (final (icon, text) in benefits) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIconMedallion(icon: icon, size: AppSizes.rowMedallion),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(text, style: typography.body.copyWith(color: colors.text)),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
        Text(
          t.t('onboarding.push.footnote'),
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}
