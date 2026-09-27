import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// `/onboarding/role` (file 07 §6.4 — **"Этот экран не менять"**: layout
/// below follows the spec/reference preview exactly, unchanged). Default
/// selection is Client, matching file 07 §6.4 ("По умолчанию выбран
/// «Клиент»") via `OnboardingFlowState.selectedRole`'s initial fallback
/// below.
class RoleScreen extends ConsumerWidget {
  const RoleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final flowState = ref.watch(onboardingFlowProvider);
    final selectedRole = flowState.selectedRole ?? UserRole.client;

    Future<void> handleContinue() async {
      ref.read(onboardingFlowProvider.notifier).selectRole(selectedRole);
      await ref.read(onboardingFlowProvider.notifier).completeOnboarding();
      if (context.mounted) context.go(AppRoutes.feed);
    }

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: IntrinsicHeight(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    // Staggered entrance (UI pass
                    // 2026-09-27); same final
                    // layout, none on reduce-
                    // motion.
                    children: staggeredEntrance([
                      const SizedBox(height: 8),
                      Text(
                        t.t('onboarding.role.title'),
                        style: typography.titleMedium.copyWith(color: colors.text),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      RoleCard(
                        icon: Icons.person_outline,
                        title: t.t('onboarding.role.client.title'),
                        description: t.t('onboarding.role.client.desc'),
                        isSelected: selectedRole == UserRole.client,
                        onTap: () => ref
                            .read(onboardingFlowProvider.notifier)
                            .selectRole(UserRole.client),
                      ),
                      const SizedBox(height: AppSpacing.roleCardGap),
                      RoleCard(
                        icon: Icons.gavel,
                        title: t.t('onboarding.role.attorney.title'),
                        description: t.t('onboarding.role.attorney.desc'),
                        isSelected: selectedRole == UserRole.attorney,
                        isAttorneyFixedStyle: true,
                        showProBadge: true,
                        onTap: () => ref
                            .read(onboardingFlowProvider.notifier)
                            .selectRole(UserRole.attorney),
                      ),
                      const Spacer(),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 22),
                        child: Column(
                          children: [
                            GavelStrikeButton(
                              label: t.t('onboarding.role.continue'),
                              onPressed: handleContinue,
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            Text(
                              t.t('onboarding.role.warning'),
                              textAlign: TextAlign.center,
                              style: typography.caption.copyWith(color: colors.textSecondary),
                            ),
                          ],
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
