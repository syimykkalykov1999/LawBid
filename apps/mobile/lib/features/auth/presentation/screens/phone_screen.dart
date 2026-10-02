import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/features/auth/presentation/widgets/us_phone_input.dart';

/// `/auth/phone` (file 07 §6.2). Stage 1.7 mobile: the country chip and
/// formatter are shared with the onboarding contacts step
/// (us_phone_input.dart); a "Use email instead" link opens the email
/// sign-in (file 01 §10.2 E) when `email_login` is on — the welcome
/// screen's email icon is frozen by owner decision (welcome_screen.dart
/// must stay byte-identical), so this is the email entry point.
class PhoneScreen extends ConsumerStatefulWidget {
  const PhoneScreen({super.key});

  @override
  ConsumerState<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends ConsumerState<PhoneScreen> {
  final _controller = TextEditingController();
  String? _localError;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit(
    BuildContext context,
    WidgetRef ref,
    Translator t,
  ) async {
    if (!UsPhone.isValid(_controller.text)) {
      setState(() => _localError = t.t('auth.phone.error.invalid'));
      return;
    }
    setState(() => _localError = null);
    final e164 = UsPhone.toE164(_controller.text);
    final ok =
        await ref.read(onboardingFlowProvider.notifier).submitPhoneNumber(e164);
    // ignore: unawaited_futures
    if (ok && context.mounted) context.push(AuthRoutes.otp);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final flowState = ref.watch(onboardingFlowProvider);
    final networkError = flowState.errorMessage;
    final emailEnabled =
        ref.watch(featureFlagsControllerProvider).isEnabled('email_login');

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned(right: -40, bottom: 70, child: WatermarkScales()),
            // `ConstrainedBox(minHeight: viewport)` + `IntrinsicHeight` +
            // `Spacer` inside a `SingleChildScrollView`: at normal text
            // scale the Spacer pushes the button to the bottom with its
            // spec'd 22px margin; at up to 200% text scale (file 07 §9),
            // where the top content alone can exceed the viewport, the
            // Spacer collapses and the whole screen scrolls so the button
            // stays reachable instead of clipping. Same pattern on the OTP
            // and role screens.
            LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenSide,
                  ),
                  child: ConstrainedBox(
                    constraints:
                        BoxConstraints(minHeight: constraints.maxHeight),
                    child: IntrinsicHeight(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        // Staggered entrance (UI pass
                        // 2026-09-27); same final
                        // layout, none on reduce-
                        // motion.
                        children: staggeredEntrance([
                          const SizedBox(height: 30),
                          AppBackButton(
                            semanticLabel: t.t('common.back'),
                            onPressed: () {
                              ref
                                  .read(onboardingFlowProvider.notifier)
                                  .goBackTo(OnboardingStep.welcome);
                              // Reached via go() from a magic-link code screen
                              // there is nothing underneath — go home instead.
                              if (context.canPop()) {
                                context.pop();
                              } else {
                                context.go(AuthRoutes.welcome);
                              }
                            },
                          ),
                          const SizedBox(height: 34),
                          Text(
                            t.t('auth.phone.title'),
                            style: typography.titleLarge
                                .copyWith(color: colors.text),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            t.t('auth.phone.subtitle'),
                            style: typography.body
                                .copyWith(color: colors.textSecondary),
                          ),
                          const SizedBox(height: 26),
                          AppTextField(
                            controller: _controller,
                            leading: const CountryCodeChip(),
                            hintText: t.t('auth.phone.hint'),
                            errorText: _localError ?? networkError,
                            keyboardType: TextInputType.phone,
                            autofocus: true,
                            semanticLabel: t.t('auth.phone.fieldLabel'),
                            inputFormatters: [UsPhoneFormatter()],
                            autofillHints: const [
                              AutofillHints.telephoneNumberNational,
                            ],
                            onChanged: (_) {
                              if (_localError != null) {
                                setState(() => _localError = null);
                              }
                              ref
                                  .read(onboardingFlowProvider.notifier)
                                  .clearError();
                            },
                          ),
                          if (emailEnabled) ...[
                            const SizedBox(height: AppSpacing.md),
                            SwitchChannelLink(
                              label: t.t('auth.phone.useEmail'),
                              onTap: () {
                                ref
                                    .read(onboardingFlowProvider.notifier)
                                    .goToEmailStep();
                                context.pushReplacement(AuthRoutes.email);
                              },
                            ),
                          ],
                          const Spacer(),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 22),
                            child: Column(
                              children: [
                                GavelStrikeButton(
                                  label: t.t('auth.phone.submit'),
                                  isLoading: flowState.isSubmitting,
                                  onPressed: () => _submit(context, ref, t),
                                ),
                                const SizedBox(height: AppSpacing.sm),
                                LegalText(
                                  text: t.t('auth.phone.terms'),
                                  links: {
                                    t.t('auth.phone.terms.usage'): () => context
                                        .push(AppRoutes.legalDoc('terms')),
                                    t.t('auth.phone.terms.privacy'): () =>
                                        context.push(
                                          AppRoutes.legalDoc('privacy'),
                                        ),
                                  },
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
          ],
        ),
      ),
    );
  }
}

/// Text link that switches between phone and email sign-in. 44px tall
/// touch target (file 07 §9).
class SwitchChannelLink extends StatelessWidget {
  const SwitchChannelLink({
    required this.label,
    required this.onTap,
    super.key,
  });

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      child: ExcludeSemantics(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadii.field),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                label,
                style: typography.bodySmall.copyWith(
                  color: colors.gold,
                  decoration: TextDecoration.underline,
                  decorationColor: colors.gold,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
