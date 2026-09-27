import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/profile/application/delete_account_controller.dart';
import 'package:lawbid/features/profile/domain/delete_account_step.dart';

/// `/profile/settings/delete-account` (file 01 §10.7: "Настройки →
/// Удалить аккаунт → предупреждение → повторная аутентификация →
/// подтверждение"). Phase 4 of the auth networking work
/// (docs/CHANGELOG.md), continuing directly after Phase 3 social login
/// (commit 2bbeba5).
///
/// One screen with an internal step switch (`DeleteAccountStep`) rather
/// than 3-4 separate routes — every step shares one piece of state (the
/// phone number, the armed reauth token) and none of them is independently
/// deep-linkable or resumable the way the onboarding flow's screens are
/// (file 07 §6.5's "закрытие приложения на середине онбординга" acceptance
/// item doesn't apply to a destructive confirmation flow — the safe
/// default on any interruption is to start over at the warning, which a
/// single screen gives for free).
class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() =>
      _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _phoneController = TextEditingController();
  final _phraseController = TextEditingController();

  @override
  void dispose() {
    _phoneController.dispose();
    _phraseController.dispose();
    super.dispose();
  }

  String get _phoneDigits =>
      _phoneController.text.replaceAll(RegExp(r'\D'), '');

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final state = ref.watch(deleteAccountControllerProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('deleteAccount.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      // UI modernization pass (2026-09-27): a danger-toned step indicator
      // (warning → re-auth → confirm) and a fade/rise cross-fade between
      // steps; instant under reduce-motion. Step logic is unchanged.
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          child: Column(
            children: [
              if (_progressFor(state.step) case final progress?) ...[
                AppStepProgress(
                  total: _totalSteps,
                  current: progress,
                  activeColor: colors.danger,
                  semanticLabel: t.t('common.stepOf', {
                    'current': '$progress',
                    'total': '$_totalSteps',
                  }),
                ),
                const SizedBox(height: AppSpacing.xl),
              ],
              Expanded(
                child: AnimatedSwitcher(
                  duration: context.reduceMotion
                      ? Duration.zero
                      : AppMotion.stepSwitch,
                  switchInCurve: AppMotion.enterCurve,
                  switchOutCurve: AppMotion.exitCurve,
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(AppMotion.pageSlideFraction, 0),
                        end: Offset.zero,
                      ).animate(animation),
                      child: child,
                    ),
                  ),
                  child: KeyedSubtree(
                    key: ValueKey<DeleteAccountStep>(state.step),
                    child: switch (state.step) {
                      DeleteAccountStep.warning => _WarningStep(t: t),
                      DeleteAccountStep.reauthPhone => _ReauthPhoneStep(
                          t: t,
                          controller: _phoneController,
                          digits: _phoneDigits,
                        ),
                      DeleteAccountStep.reauthCode => _ReauthCodeStep(t: t),
                      DeleteAccountStep.confirmPhrase => _ConfirmPhraseStep(
                          t: t,
                          phraseController: _phraseController,
                        ),
                      DeleteAccountStep.submitting => const _SubmittingStep(),
                      DeleteAccountStep.done => _DoneStep(t: t),
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

const _totalSteps = 3;

/// 1-based position in the warning → re-auth → confirm sequence, or null
/// once the flow is finished (no indicator on the success screen).
int? _progressFor(DeleteAccountStep step) => switch (step) {
      DeleteAccountStep.warning => 1,
      DeleteAccountStep.reauthPhone || DeleteAccountStep.reauthCode => 2,
      DeleteAccountStep.confirmPhrase || DeleteAccountStep.submitting => 3,
      DeleteAccountStep.done => null,
    };

/// Shared step layout: scrollable [content] on top (never overflows, even
/// at 200% text scale — file 07 §9, same a11y concern the onboarding
/// screens document), one fixed [action] pinned to the bottom.
class _StepLayout extends StatelessWidget {
  const _StepLayout({required this.content, required this.action});

  final List<Widget> content;
  final Widget action;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: staggeredEntrance(content),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        action,
      ],
    );
  }
}

class _WarningStep extends ConsumerWidget {
  const _WarningStep({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return _StepLayout(
      content: [
        const AppIconMedallion(
          icon: Icons.warning_amber_rounded,
          tone: AppMedallionTone.danger,
          size: AppSizes.stateMedallion,
          iconSize: AppSizes.stateIcon,
        ),
        const SizedBox(height: AppSpacing.xl),
        Text(
          t.t('deleteAccount.warning.title'),
          style: typography.titleLarge.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('deleteAccount.warning.body'),
          style: typography.body.copyWith(color: colors.textSecondary),
        ),
      ],
      action: AppButton(
        label: t.t('deleteAccount.warning.continue'),
        variant: AppButtonVariant.secondary,
        onPressed: () => ref
            .read(deleteAccountControllerProvider.notifier)
            .acknowledgeWarning(),
      ),
    );
  }
}

class _ReauthPhoneStep extends ConsumerWidget {
  const _ReauthPhoneStep({
    required this.t,
    required this.controller,
    required this.digits,
  });

  final Translator t;
  final TextEditingController controller;
  final String digits;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(deleteAccountControllerProvider);
    final notifier = ref.read(deleteAccountControllerProvider.notifier);

    Future<void> useBiometric() async {
      final ok = await notifier.tryBiometric(
        reason: t.t('deleteAccount.reauth.biometric.prompt'),
      );
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? t.t('deleteAccount.reauth.biometric.prompt')
                : t.t('deleteAccount.reauth.useCode'),
          ),
        ),
      );
    }

    final errorText = state.errorMessage == null
        ? null
        : (state.errorMessage == 'network'
            ? t.t('deleteAccount.reauth.error.network')
            : t.t('deleteAccount.reauth.error.expired'));

    return _StepLayout(
      content: [
        Text(
          t.t('deleteAccount.reauth.title'),
          style: typography.titleLarge.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.md),
        if (state.biometricAvailable) ...[
          AppButton(
            label: t.t('deleteAccount.reauth.biometric.button'),
            variant: AppButtonVariant.secondary,
            icon: Icons.fingerprint,
            onPressed: useBiometric,
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            t.t('deleteAccount.reauth.useCode'),
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        Text(
          t.t('deleteAccount.reauth.phoneHint'),
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.xs),
        AppTextField(
          controller: controller,
          hintText: '(555) 123-4567',
          keyboardType: TextInputType.phone,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          errorText: errorText,
        ),
      ],
      action: AppButton(
        label: t.t('deleteAccount.reauth.sendCode'),
        isLoading: state.isSubmitting,
        isEnabled: digits.length == 10,
        dimWhenDisabled: true,
        onPressed: digits.length == 10
            ? () => notifier.submitPhone('+1$digits')
            : null,
      ),
    );
  }
}

class _ReauthCodeStep extends ConsumerStatefulWidget {
  const _ReauthCodeStep({required this.t});

  final Translator t;

  @override
  ConsumerState<_ReauthCodeStep> createState() => _ReauthCodeStepState();
}

/// `_currentCode` tracking mirrors `_OtpScreenState` exactly
/// (features/auth/presentation/screens/otp_screen.dart) — see that file's
/// doc comment on its own manual-submit button for why a State field
/// (not a `build()`-local variable, which would reset on every rebuild)
/// is needed here.
class _ReauthCodeStepState extends ConsumerState<_ReauthCodeStep> {
  String _currentCode = '';

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(deleteAccountControllerProvider);
    final notifier = ref.read(deleteAccountControllerProvider.notifier);

    return _StepLayout(
      content: [
        Text(
          t.t('deleteAccount.reauth.title'),
          style: typography.titleLarge.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t(
            'deleteAccount.reauth.codeSubtitle',
            {'phone': state.phoneNumber ?? ''},
          ),
          style: typography.body.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        AppOtpField(
          semanticLabel: t.t('auth.otp.fieldLabel'),
          onChanged: (value) => _currentCode = value,
          onCompleted: notifier.submitCode,
          errorText: state.errorMessage == 'invalid'
              ? t.t('deleteAccount.reauth.error.invalid')
              : null,
        ),
      ],
      action: AppButton(
        label: t.t('deleteAccount.reauth.submit'),
        isLoading: state.isSubmitting,
        onPressed: () {
          if (_currentCode.length == 6) notifier.submitCode(_currentCode);
        },
      ),
    );
  }
}

class _ConfirmPhraseStep extends ConsumerWidget {
  const _ConfirmPhraseStep({required this.t, required this.phraseController});

  final Translator t;
  final TextEditingController phraseController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final state = ref.watch(deleteAccountControllerProvider);
    final notifier = ref.read(deleteAccountControllerProvider.notifier);
    final expectedPhrase = t.t('deleteAccount.confirmPhrase.phrase');
    final matches = state.confirmPhraseInput.trim() == expectedPhrase;

    return _StepLayout(
      content: [
        Text(
          t.t('deleteAccount.confirmPhrase.title'),
          style: typography.titleLarge.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('deleteAccount.confirmPhrase.label', {'phrase': expectedPhrase}),
          style: typography.body.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          controller: phraseController,
          hintText: expectedPhrase,
          onChanged: notifier.confirmPhraseChanged,
          errorText: state.errorMessage == 'network'
              ? t.t('deleteAccount.error.generic')
              : null,
        ),
      ],
      action: AppButton(
        label: t.t('deleteAccount.submit'),
        icon: Icons.delete_forever_rounded,
        variant: AppButtonVariant.danger,
        isLoading: state.isSubmitting,
        isEnabled: matches && !state.isSubmitting,
        dimWhenDisabled: true,
        onPressed:
            matches && !state.isSubmitting ? notifier.submitDeletion : null,
      ),
    );
  }
}

class _SubmittingStep extends StatelessWidget {
  const _SubmittingStep();

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Center(child: CircularProgressIndicator(color: colors.gold));
  }
}

class _DoneStep extends StatelessWidget {
  const _DoneStep({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return _StepLayout(
      content: [
        const AppIconMedallion(
          icon: Icons.check_rounded,
          tone: AppMedallionTone.success,
          size: AppSizes.stateMedallion,
          iconSize: AppSizes.stateIcon,
        ),
        const SizedBox(height: AppSpacing.xl),
        Text(
          t.t('deleteAccount.success.title'),
          style: typography.titleLarge.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t('deleteAccount.success.body'),
          style: typography.body.copyWith(color: colors.textSecondary),
        ),
      ],
      action: AppButton(
        label: t.t('deleteAccount.success.action'),
        onPressed: () => context.go(AuthRoutes.welcome),
      ),
    );
  }
}
