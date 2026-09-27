import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';

/// Shared frame for every `/onboarding/<step>` screen (docs/01_FOUNDATION_
/// AUTH.md §11: "Прогресс-бар сверху, кнопка «Назад» везде"):
///
/// - top: back button + segmented progress for the user's role;
/// - middle: serif title, subtitle, then [children] staggered in and
///   scrollable (never clips at 200% text scale, file 07 §9);
/// - bottom: sticky primary action (+ optional secondary) and an inline
///   error banner right above it, next to the action that failed.
class OnboardingScaffold extends ConsumerWidget {
  const OnboardingScaffold({
    required this.step,
    required this.title,
    required this.children,
    super.key,
    this.subtitle,
    this.primaryLabel,
    this.onPrimary,
    this.primaryLoading = false,
    this.secondary,
    this.onBack,
    this.error,
    this.footnote,
  });

  final OnboardingStepId step;
  final String title;
  final String? subtitle;
  final List<Widget> children;
  final String? primaryLabel;
  final VoidCallback? onPrimary;
  final bool primaryLoading;

  /// Usually a text-style "Skip"/"Later" [AppButton] (secondary variant).
  final Widget? secondary;

  /// Null hides the back button.
  final VoidCallback? onBack;

  /// Last failed action; rendered as [ActionErrorBanner].
  final Object? error;

  /// Small helper text under the primary button (e.g. what's missing).
  final String? footnote;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final role = ref.watch(currentUserRoleProvider);
    final order = OnboardingStepId.orderFor(role);
    final index = order.indexOf(step);
    final current = index < 0 ? order.length : index + 1;

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide - AppSpacing.sm,
                AppSpacing.sm,
                AppSpacing.screenSide,
                0,
              ),
              child: Row(
                children: [
                  if (onBack != null)
                    AppBackButton(
                        semanticLabel: t.t('common.back'), onPressed: onBack!)
                  else
                    const SizedBox(
                        width: AppSizes.touchTarget,
                        height: AppSizes.touchTarget),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppStepProgress(
                      total: order.length,
                      current: current,
                      semanticLabel: t.t('common.stepOf', {
                        'current': '$current',
                        'total': '${order.length}',
                      }),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.xl,
                  AppSpacing.screenSide,
                  AppSpacing.xl,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: staggeredEntrance([
                    Semantics(
                      header: true,
                      child: Text(title,
                          style: typography.titleLarge
                              .copyWith(color: colors.text)),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        subtitle!,
                        style: typography.body
                            .copyWith(color: colors.textSecondary),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.xl),
                    ...children,
                  ]),
                ),
              ),
            ),
            if (primaryLabel != null || secondary != null || error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.lg,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (error != null) ...[
                      ActionErrorBanner(error: error!),
                      const SizedBox(height: AppSpacing.md),
                    ],
                    if (primaryLabel != null)
                      AppButton(
                        label: primaryLabel!,
                        isLoading: primaryLoading,
                        onPressed: onPrimary,
                      ),
                    if (footnote != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        footnote!,
                        textAlign: TextAlign.center,
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                    ],
                    if (secondary != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      secondary!,
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

/// Inline, localized error for a failed action (docs/01 §7: text by
/// `code`, never the server's `message`). Offline gets its own wording.
class ActionErrorBanner extends ConsumerWidget {
  const ActionErrorBanner({required this.error, super.key});

  final Object error;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final offline = isOfflineError(error);
    final message = offline ? t.t('offline.message') : errorText(t, error);

    return Semantics(
      liveRegion: true,
      child: AnimatedSwitcher(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
        child: Container(
          key: ValueKey(message),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: offline ? colors.goldTint : colors.dangerTint,
            borderRadius: BorderRadius.circular(AppRadii.field),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
                size: AppSizes.iconSm,
                color: offline ? colors.goldDark : colors.danger,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(message,
                    style: typography.bodySmall.copyWith(color: colors.text)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small uppercase-free section caption used inside step bodies.
class StepSectionLabel extends StatelessWidget {
  const StepSectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Semantics(
        header: true,
        child: Text(text,
            style: typography.caption.copyWith(color: colors.textSecondary)),
      ),
    );
  }
}
