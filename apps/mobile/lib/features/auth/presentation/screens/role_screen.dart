// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// `/onboarding/role` (file 07 §6.4 — **"Этот экран не менять"**: layout
/// below follows the spec/reference preview exactly, unchanged). Default
/// selection is Client, matching file 07 §6.4 ("По умолчанию выбран
/// «Клиент»") via `OnboardingFlowState.selectedRole`'s initial fallback
/// below.
///
/// Stage 1.7 mobile: "Продолжить" now calls `POST /users/me/role` (then
/// refreshes the access token for the `role` claim) via
/// [OnboardingActions.chooseRole]; AppRouterGuard moves on from there. A
/// role that is already set server-side is pre-selected and can't change
/// (§11: "роль потом изменить нельзя"): the other card is shown disabled
/// with a short note under the cards, and Continue just moves forward
/// without an API call (owner device test 2026-09-27).
class RoleScreen extends ConsumerWidget {
  const RoleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final flowState = ref.watch(onboardingFlowProvider);
    final serverRole =
        ref.watch(currentUserControllerProvider.select((s) => s.user?.role));
    final selectedRole =
        serverRole ?? flowState.selectedRole ?? UserRole.client;
    final action = ref.watch(onboardingActionsProvider);
    final attorneySide =
        selectedRole == UserRole.attorney || selectedRole == UserRole.assistant;

    void select(UserRole role) {
      if (serverRole != null) return;
      ref.read(onboardingFlowProvider.notifier).selectRole(role);
    }

    Future<void> handleContinue() async {
      final user = ref.read(currentUserControllerProvider).user;
      if (serverRole != null && user != null) {
        context.go(AppRouterGuard.forwardRoute(user));
        return;
      }
      final ok = await ref
          .read(onboardingActionsProvider.notifier)
          .chooseRole(selectedRole);
      if (!ok && context.mounted) {
        final error = ref.read(onboardingActionsProvider).error;
        if (error != null) showAppSnackBar(context, errorText(t, error));
      }
    }

    /// The card of the role that can no longer be picked: dimmed, inert.
    Widget lockable(UserRole role, Widget card) {
      if (serverRole == null || serverRole == role) return card;
      return Semantics(
        enabled: false,
        child: IgnorePointer(
          key: ValueKey('role-card-disabled-${role.name}'),
          child: Opacity(opacity: AppSizes.disabledOpacity, child: card),
        ),
      );
    }

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
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
                        style:
                            typography.titleMedium.copyWith(color: colors.text),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      lockable(
                        UserRole.client,
                        RoleCard(
                          icon: AppIcons.personOutline,
                          title: t.t('onboarding.role.client.title'),
                          description: t.t('onboarding.role.client.desc'),
                          isSelected: selectedRole == UserRole.client,
                          onTap: () => select(UserRole.client),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.roleCardGap),
                      // Owner 2026-10-01: the assistant role lives inside
                      // the attorney role — pick "Attorney", then who you
                      // are in the practice.
                      lockable(
                        attorneySide ? selectedRole : UserRole.attorney,
                        RoleCard(
                          icon: AppIcons.gavel,
                          title: t.t('onboarding.role.attorney.title'),
                          description: t.t('onboarding.role.attorney.desc'),
                          isSelected: attorneySide,
                          isAttorneyFixedStyle: true,
                          showProBadge: true,
                          proBadgeLabel: t.t('onboarding.role.attorney.badge'),
                          onTap: () {
                            if (!attorneySide) select(UserRole.attorney);
                          },
                        ),
                      ),
                      AnimatedSize(
                        duration: context.reduceMotion
                            ? Duration.zero
                            : AppMotion.stateChange,
                        curve: Curves.easeOutCubic,
                        child: !attorneySide
                            ? const SizedBox(width: double.infinity)
                            : Padding(
                                padding: const EdgeInsets.only(
                                  top: AppSpacing.sm,
                                  left: AppSpacing.lg,
                                ),
                                child: Column(
                                  children: [
                                    for (final (role, icon, title, body) in [
                                      (
                                        UserRole.attorney,
                                        AppIcons.balanceRounded,
                                        t.t('onboarding.role.sub.attorney'),
                                        t.t('onboarding.role.sub.attorney.body'),
                                      ),
                                      (
                                        UserRole.assistant,
                                        AppIcons.supportAgentRounded,
                                        t.t('onboarding.role.assistant.title'),
                                        t.t('onboarding.role.assistant.body'),
                                      ),
                                    ])
                                      Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: AppSpacing.sm,
                                        ),
                                        child: lockable(
                                          role,
                                          _SubRole(
                                            key: ValueKey(
                                              role == UserRole.assistant
                                                  ? 'role-card-assistant'
                                                  : 'role-sub-attorney',
                                            ),
                                            icon: icon,
                                            title: title,
                                            body: body,
                                            selected: selectedRole == role,
                                            onTap: () => select(role),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                      ),
                      if (serverRole != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          t.t('onboarding.role.locked'),
                          key: const ValueKey('role-locked-note'),
                          style: typography.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                      ],
                      const Spacer(),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 22),
                        child: Column(
                          children: [
                            GavelStrikeButton(
                              label: t.t('onboarding.role.continue'),
                              isLoading: action.busy,
                              onPressed: handleContinue,
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            Text(
                              t.t('onboarding.role.warning'),
                              textAlign: TextAlign.center,
                              style: typography.caption
                                  .copyWith(color: colors.textSecondary),
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

/// A choice inside the attorney card: the attorney or their assistant.
class _SubRole extends StatelessWidget {
  const _SubRole({
    required this.icon,
    required this.title,
    required this.body,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String body;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      selected: selected,
      button: true,
      label: title,
      child: AppPressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: selected ? colors.goldTint : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(
              color: selected ? colors.gold : colors.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              AppIcon(icon, color: colors.goldDark),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: typography.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      body,
                      style: typography.bodySmall
                          .copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              AppIcon(
                selected
                    ? AppIcons.radioButtonCheckedRounded
                    : AppIcons.radioButtonUncheckedRounded,
                color: selected ? colors.goldDark : colors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
