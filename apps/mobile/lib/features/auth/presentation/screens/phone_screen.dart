import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/l10n_providers.dart';
import '../../../../core/l10n/translator.dart';
import '../../application/onboarding_flow.dart';
import '../../auth_routes.dart';
import '../../domain/onboarding_step.dart';

/// `/auth/phone` (file 07 §6.2).
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

  String get _digits => _controller.text.replaceAll(RegExp(r'\D'), '');

  Future<void> _submit(BuildContext context, WidgetRef ref, Translator t) async {
    if (_digits.length != 10) {
      setState(() => _localError = t.t('auth.phone.error.invalid'));
      return;
    }
    setState(() => _localError = null);
    final e164 = '+1$_digits';
    final ok = await ref.read(onboardingFlowProvider.notifier).submitPhoneNumber(e164);
    if (ok && context.mounted) context.push(AuthRoutes.otp);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final flowState = ref.watch(onboardingFlowProvider);
    final networkError = flowState.errorMessage;

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Stack(
          children: [
            Positioned(right: -40, bottom: 70, child: const WatermarkScales()),
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
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(minHeight: constraints.maxHeight),
                    child: IntrinsicHeight(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SizedBox(height: 30),
                          AppBackButton(
                            semanticLabel: t.t('common.back'),
                            onPressed: () {
                              ref
                                  .read(onboardingFlowProvider.notifier)
                                  .goBackTo(OnboardingStep.welcome);
                              context.pop();
                            },
                          ),
                          const SizedBox(height: 34),
                          Text(
                            t.t('auth.phone.title'),
                            style: typography.titleLarge.copyWith(color: colors.text),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            t.t('auth.phone.subtitle'),
                            style: typography.body.copyWith(color: colors.textSecondary),
                          ),
                          const SizedBox(height: 26),
                          AppTextField(
                            controller: _controller,
                            leading: const _CountryChip(),
                            hintText: '(555) 123-4567',
                            errorText: _localError ?? networkError,
                            keyboardType: TextInputType.phone,
                            autofocus: true,
                            semanticLabel: t.t('auth.phone.fieldLabel'),
                            inputFormatters: [_UsPhoneFormatter()],
                            onChanged: (_) {
                              if (_localError != null) setState(() => _localError = null);
                            },
                          ),
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
                                    t.t('auth.phone.terms.usage'): () {},
                                    t.t('auth.phone.terms.privacy'): () {},
                                  },
                                ),
                              ],
                            ),
                          ),
                        ],
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

class _CountryChip extends StatelessWidget {
  const _CountryChip();

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return ExcludeSemantics(
      // Static single-country stub (file 07 doesn't spec a country picker;
      // only US numbers are supported in this pass — flagged as a known
      // limitation in docs/CHANGELOG.md).
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: colors.bg,
          borderRadius: BorderRadius.circular(AppRadii.chip),
          border: Border.all(color: colors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('US +1', style: typography.bodySmall.copyWith(color: colors.textSecondary)),
            const SizedBox(width: 4),
            ChevronGlyph(
              direction: ChevronDirection.down,
              size: 15,
              color: colors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}

/// Formats digits as `(XXX) XXX-XXXX` while typing, capped at 10 digits
/// (US numbers only — see `_CountryChip`'s doc comment).
class _UsPhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final limited = digits.length > 10 ? digits.substring(0, 10) : digits;

    final buffer = StringBuffer();
    if (limited.isNotEmpty) {
      buffer.write('(');
      buffer.write(limited.substring(0, limited.length < 3 ? limited.length : 3));
    }
    if (limited.length >= 3) {
      buffer.write(') ');
      buffer.write(limited.substring(3, limited.length < 6 ? limited.length : 6));
    }
    if (limited.length >= 6) {
      buffer.write('-');
      buffer.write(limited.substring(6));
    }

    final formatted = buffer.toString();
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
