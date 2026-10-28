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
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
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
    final onboardingDone = ref.watch(
      currentUserControllerProvider
          .select((s) => s.user?.onboarding.isCompleted ?? false),
    );
    // Owner 2026-10-15: until onboarding is finished the role can be chosen
    // again (someone who looked at the lawyer side and went back); after it,
    // the role is final.
    final locked = serverRole != null && onboardingDone;
    final selectedRole = locked
        ? serverRole
        : flowState.selectedRole ?? serverRole ?? UserRole.client;
    final action = ref.watch(onboardingActionsProvider);
    // Owner 2026-10-11: an assistant signs in only with an invite code, not
    // through this screen — here the choice is client or attorney.
    final attorneySide = selectedRole == UserRole.attorney;

    void select(UserRole role) {
      if (locked) return;
      ref.read(onboardingFlowProvider.notifier).selectRole(role);
    }

    Future<void> handleContinue() async {
      final user = ref.read(currentUserControllerProvider).user;
      if (serverRole != null && user != null && selectedRole == serverRole) {
        context.go(AppRouterGuard.forwardRoute(user));
        return;
      }
      // Owner 2026-10-28: the role stays reachable until onboarding ends,
      // but switching an already chosen one asks first (an attorney's
      // verification draft must not vanish by a stray tap).
      if (serverRole != null && selectedRole != serverRole) {
        final sure = await showDialog<bool>(
          context: context,
          builder: (ctx) {
            final c = Theme.of(ctx).extension<AppColorTokens>()!;
            return AppAlertDialog(
              backgroundColor: c.sheet,
              title: Text(t.t('auth.role.change.title')),
              content: Text(t.t('auth.role.change.body')),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(ctx).pop(false),
                  child: Text(t.t('common.cancel')),
                ),
                TextButton(
                  key: const ValueKey('role-change-confirm'),
                  onPressed: () => Navigator.of(ctx).pop(true),
                  child: Text(t.t('auth.role.change.confirm')),
                ),
              ],
            );
          },
        );
        if (!(sure ?? false) || !context.mounted) return;
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
      if (!locked || serverRole == role) return card;
      return Semantics(
        enabled: false,
        child: IgnorePointer(
          key: ValueKey('role-card-disabled-${role.name}'),
          child: Opacity(opacity: AppSizes.disabledOpacity, child: card),
        ),
      );
    }

    void back() =>
        context.go(OnboardingRoutes.forStep(OnboardingStepId.consents));

    return StepBackGesture(
      onBack: back,
      child: Scaffold(
        backgroundColor: colors.bg,
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                ),
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
                        // Owner 2026-10-15: one step back, to the consents
                        // (never to the phone / SMS).
                        Align(
                          alignment: AlignmentDirectional.centerStart,
                          child: AppBackButton(
                            semanticLabel: t.t('common.back'),
                            onPressed: back,
                          ),
                        ),
                        Text(
                          t.t('onboarding.role.title'),
                          style: typography.titleMedium
                              .copyWith(color: colors.text),
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
                            proBadgeLabel:
                                t.t('onboarding.role.attorney.badge'),
                            onTap: () {
                              if (!attorneySide) select(UserRole.attorney);
                            },
                          ),
                        ),
                        if (locked) ...[
                          const SizedBox(height: AppSpacing.md),
                          Text(
                            t.t('onboarding.role.locked'),
                            key: const ValueKey('role-locked-note'),
                            style: typography.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                        Padding(
                          padding: const EdgeInsets.only(top: 16, bottom: 22),
                          child: Column(
                            children: [
                              GavelStrikeButton(
                                label: t.t('onboarding.role.continue'),
                                isLoading: action.busy,
                                onPressed: handleContinue,
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
      ),
    );
  }
}
