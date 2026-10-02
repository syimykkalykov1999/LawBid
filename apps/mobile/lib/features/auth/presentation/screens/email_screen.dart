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
import 'package:lawbid/features/auth/domain/onboarding_flow_state.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/features/auth/presentation/screens/phone_screen.dart';

/// Loose client-side shape check; the server is the authority (it also
/// rejects relay/disposable domains for contacts — CONTACT_DOMAIN_BLOCKED).
final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

bool isPlausibleEmail(String value) => _emailPattern.hasMatch(value.trim());

/// `/auth/email` — email sign-in (docs/01_FOUNDATION_AUTH.md §10.2 E),
/// same layout and behavior as the phone screen (§10.2 C); the 6-digit
/// code is entered on the shared `/auth/otp` screen (§10.2 F).
class EmailScreen extends ConsumerStatefulWidget {
  const EmailScreen({super.key});

  @override
  ConsumerState<EmailScreen> createState() => _EmailScreenState();
}

class _EmailScreenState extends ConsumerState<EmailScreen> {
  final _controller = TextEditingController();
  String? _localError;

  @override
  void initState() {
    super.initState();
    // Back from an email code screen that a magic link opened ("Change
    // email"): start from the address the link was for.
    final flow = ref.read(onboardingFlowProvider);
    if (flow.channel == AuthChannel.email && flow.identifier != null) {
      _controller.text = flow.identifier!;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit(Translator t) async {
    if (!isPlausibleEmail(_controller.text)) {
      setState(() => _localError = t.t('auth.email.error.invalid'));
      return;
    }
    setState(() => _localError = null);
    final ok = await ref
        .read(onboardingFlowProvider.notifier)
        .submitEmail(_controller.text);
    if (ok && mounted) await context.push(AuthRoutes.otp);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final flowState = ref.watch(onboardingFlowProvider);
    final phoneEnabled =
        ref.watch(featureFlagsControllerProvider).isEnabled('phone_login');

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned(right: -40, bottom: 70, child: WatermarkScales()),
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
                          Semantics(
                            header: true,
                            child: Text(
                              t.t('auth.email.title'),
                              style: typography.titleLarge
                                  .copyWith(color: colors.text),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Text(
                            t.t('auth.email.subtitle'),
                            style: typography.body
                                .copyWith(color: colors.textSecondary),
                          ),
                          const SizedBox(height: 26),
                          AppTextField(
                            controller: _controller,
                            hintText: t.t('auth.email.hint'),
                            errorText: _localError ?? flowState.errorMessage,
                            keyboardType: TextInputType.emailAddress,
                            autofocus: true,
                            semanticLabel: t.t('auth.email.fieldLabel'),
                            autofillHints: const [AutofillHints.email],
                            textInputAction: TextInputAction.go,
                            onSubmitted: (_) => _submit(t),
                            onChanged: (_) {
                              if (_localError != null) {
                                setState(() => _localError = null);
                              }
                              ref
                                  .read(onboardingFlowProvider.notifier)
                                  .clearError();
                            },
                          ),
                          if (phoneEnabled) ...[
                            const SizedBox(height: AppSpacing.md),
                            SwitchChannelLink(
                              label: t.t('auth.email.usePhone'),
                              onTap: () {
                                ref
                                    .read(onboardingFlowProvider.notifier)
                                    .goToPhoneStep();
                                context.pushReplacement(AuthRoutes.phone);
                              },
                            ),
                          ],
                          const Spacer(),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 22),
                            child: Column(
                              children: [
                                AppButton(
                                  label: t.t('auth.phone.submit'),
                                  isLoading: flowState.isSubmitting,
                                  onPressed: () => _submit(t),
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
