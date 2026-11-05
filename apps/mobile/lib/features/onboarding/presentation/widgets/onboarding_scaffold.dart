import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Shared frame for every `/onboarding/<step>` screen (docs/01_FOUNDATION_
/// AUTH.md §11: "Прогресс-бар сверху, кнопка «Назад» везде"):
///
/// - top: back button + the numbered stepper for the user's role (owner
///   2026-11-05: the attorney wizard's numbers, centred), its caption;
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
    this.primaryEnabled = true,
    this.secondary,
    this.onBack,
    this.error,
    this.footnote,
    this.body,
    this.progress,
  });

  /// Replaces the scrolling [children] column with a widget that manages
  /// its own scrolling and actions (e.g. the practices editor); the title
  /// stays on top.
  final Widget? body;

  /// (current, total) override of the stepper — the attorney's
  /// verification step shows its own sub-steps (licence, practices,
  /// subscription) as numbers.
  final (int, int)? progress;

  final OnboardingStepId step;
  final String title;
  final String? subtitle;
  final List<Widget> children;
  final String? primaryLabel;
  final VoidCallback? onPrimary;
  final bool primaryLoading;

  /// False while the form is incomplete: the button is grey and inert.
  final bool primaryEnabled;

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
    final blocker = ref.watch(onboardingBlockerProvider);
    final shownError = error ?? (blocker?.step == step ? blocker!.error : null);
    return StepBackGesture(
      onBack: onBack,
      child: Scaffold(
        backgroundColor: colors.bg,
        body: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              OnboardingStepHeader(
                step: step,
                onBack: onBack,
                progress: progress,
              ),
              if (body != null) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.lg,
                    AppSpacing.screenSide,
                    0,
                  ),
                  child: Semantics(
                    header: true,
                    child: Text(
                      title,
                      style: typography.titleLarge.copyWith(color: colors.text),
                    ),
                  ),
                ),
                Expanded(child: body!),
              ] else
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
                          child: Text(
                            title,
                            style: typography.titleLarge
                                .copyWith(color: colors.text),
                          ),
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
              if (primaryLabel != null ||
                  secondary != null ||
                  shownError != null)
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
                      if (shownError != null) ...[
                        ActionErrorBanner(error: shownError),
                        const SizedBox(height: AppSpacing.md),
                      ],
                      if (primaryLabel != null)
                        AppButton(
                          label: primaryLabel!,
                          isLoading: primaryLoading,
                          // Owner 2026-10-11: grey and not tappable until the
                          // required data is in.
                          isEnabled: primaryEnabled,
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
      ),
    );
  }
}

/// Top of every sign-up step (owner 2026-11-05): back arrow, the numbered
/// stepper exactly centred, the step's name and "Step N of M". Shared with
/// the role screen, so the numbers run 1 → 2 → 3 without a gap.
class OnboardingStepHeader extends ConsumerWidget {
  const OnboardingStepHeader({
    required this.step,
    super.key,
    this.onBack,
    this.progress,
  });

  final OnboardingStepId step;

  /// Null leaves a blank in the arrow's place.
  final VoidCallback? onBack;

  /// (current, total) override, see [OnboardingScaffold.progress].
  final (int, int)? progress;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final role = ref.watch(currentUserRoleProvider);
    final index = OnboardingStepId.orderFor(role).indexOf(step);
    // One number per screen the person goes through. An attorney's
    // verification step is three of them (licence, practices, finish),
    // counted on every step so the total never changes once the role is
    // known.
    final labels = onboardingStepLabels(t, role);
    final (current, total) = progress ??
        (
          // Verification (the only step with three numbers) is last, so a
          // step's number is its position.
          index < 0 ? labels.length : index + 1,
          labels.length,
        );
    final stepOf = t.t('common.stepOf', {
      'current': context.digits(current),
      'total': context.digits(total),
    });
    final currentLabel =
        current >= 1 && current <= labels.length ? labels[current - 1] : '';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            AppSpacing.screenSide - AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.screenSide - AppSpacing.sm,
            0,
          ),
          // The back arrow on the start side and a blank of the same width
          // on the end side keep the numbers exactly centred.
          child: Row(
            children: [
              if (onBack != null)
                AppBackButton(
                  semanticLabel: t.t('common.back'),
                  onPressed: onBack!,
                )
              else
                const SizedBox(
                  width: AppSizes.touchTarget,
                  height: AppSizes.touchTarget,
                ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppNumberedStepRail(
                  key: const ValueKey('onboarding-stepper'),
                  count: total,
                  current: current - 1,
                  labels: labels,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              const SizedBox(width: AppSizes.touchTarget),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.xs,
            AppSpacing.screenSide,
            0,
          ),
          child: AppStepCaption(label: currentLabel, stepOfLabel: stepOf),
        ),
      ],
    );
  }
}

/// The names under the numbered stepper, one per number, for [role]
/// (`null` = not chosen yet: the client's path, the shortest).
List<String> onboardingStepLabels(Translator t, UserRole? role) => [
      for (final s in OnboardingStepId.orderFor(role))
        ...switch (s) {
          OnboardingStepId.consents => [t.t('onboarding.stepper.consents')],
          OnboardingStepId.role => [t.t('onboarding.stepper.role')],
          OnboardingStepId.profile => [t.t('onboarding.stepper.profile')],
          OnboardingStepId.verification => [
              t.t('onboarding.stepper.license'),
              t.t('onboarding.stepper.practices'),
              t.t('onboarding.stepper.finish'),
            ],
          // Not in any order today (owner 2026-10-11/13).
          OnboardingStepId.contacts ||
          OnboardingStepId.push ||
          OnboardingStepId.tour =>
            const <String>[],
        },
    ];

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
              AppIcon(
                offline
                    ? AppIcons.wifiOffRounded
                    : AppIcons.errorOutlineRounded,
                size: AppSizes.iconSm,
                color: offline ? colors.iconTint : colors.danger,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  message,
                  style: typography.bodySmall.copyWith(color: colors.text),
                ),
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
        child: Text(
          text,
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
      ),
    );
  }
}
