import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/onboarding_flow_state.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/features/auth/presentation/widgets/us_phone_input.dart';

/// Human-readable form of the flow's identifier for "We sent it to …".
String displayIdentifier(OnboardingFlowState state) {
  final id = state.identifier ?? '';
  return state.channel == AuthChannel.phone ? UsPhone.format(id) : id;
}

/// `/auth/otp` (file 07 §6.3) — shared by phone and email sign-in (file 01
/// §10.2 D/F). Stage 1.7 mobile: after a successful verify this screen no
/// longer navigates — AppRouterGuard sends the user to the right
/// onboarding step (or the feed) as soon as `GET /users/me` lands.
class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  String _currentCode = '';

  /// Shared with AppOtpField so a code that arrives by itself (Android SMS
  /// Retriever, email magic link — `OnboardingFlowState.autofilledCode`)
  /// shows up in the 6 cells while the flow verifies it.
  final _codeController = TextEditingController();

  void _showAutofilledCode(String? code) {
    if (code == null || code == _codeController.text) return;
    _codeController.text = code;
    _currentCode = code;
  }

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  /// Back / «Изменить номер»: returns to the phone or email entry step.
  /// Pops when that screen is underneath (the normal flow); a magic link
  /// opens this screen on its own, so then it navigates there instead.
  void _returnToEntry(OnboardingStep entry) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(entry == OnboardingStep.email ? AuthRoutes.email : AuthRoutes.phone);
    }
  }

  @override
  void initState() {
    super.initState();
    _showAutofilledCode(ref.read(onboardingFlowProvider).autofilledCode);
    // a11y review (ecc:a11y-architect, docs/CHANGELOG.md stage 1.7):
    // AppOtpField autofocuses its hidden field the instant this screen
    // appears. For a screen-reader user that's disorienting without
    // context — they land straight into an input with no announcement of
    // what it's for. Pairing autofocus with an explicit announcement (after
    // the first frame, so it doesn't race the focus-change announcement
    // the field itself triggers) gives that context once, instead of
    // relying on the fast-updating resend countdown (which is intentionally
    // excluded from the semantics tree — see `_ResendCountdown`).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final t = ref.read(translatorProvider);
      final phone = displayIdentifier(ref.read(onboardingFlowProvider));
      SemanticsService.announce(
        t.t('auth.otp.subtitle', {'phone': phone}),
        TextDirection.ltr,
      );
    });
  }

  Future<void> _handleCompleted(String code) async {
    await ref.read(onboardingFlowProvider.notifier).verifyOtp(code);
  }

  Future<void> _resend() async {
    final message = await ref.read(onboardingFlowProvider.notifier).resendOtp();
    if (message != null && mounted) showAppSnackBar(context, message);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final flowState = ref.watch(onboardingFlowProvider);
    final phone = displayIdentifier(flowState);
    ref.listen(
      onboardingFlowProvider.select((s) => s.autofilledCode),
      (_, code) => _showAutofilledCode(code),
    );

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned(right: -40, bottom: 70, child: WatermarkScales()),
            // See PhoneScreen's doc comment on this same pattern (file 07
            // §9: scrollable so the button stays reachable up to 200% text
            // scale, but visually pinned to the bottom at normal scale).
            LayoutBuilder(
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
                          const SizedBox(height: 30),
                          AppBackButton(
                            semanticLabel: t.t('common.back'),
                            onPressed: () => _returnToEntry(
                              ref.read(onboardingFlowProvider.notifier).changeIdentifier(),
                            ),
                          ),
                          const SizedBox(height: 34),
                          Text(
                            t.t('auth.otp.title'),
                            style: typography.titleLarge.copyWith(color: colors.text),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            t.t('auth.otp.subtitle', {'phone': phone}),
                            style: typography.body.copyWith(color: colors.textSecondary),
                          ),
                          const SizedBox(height: 26),
                          AppOtpField(
                            controller: _codeController,
                            errorText: flowState.errorMessage,
                            onChanged: (value) => _currentCode = value,
                            onCompleted: _handleCompleted,
                          ),
                          const SizedBox(height: 14),
                          _ResendCountdown(
                            t: t,
                            onResend: _resend,
                          ),
                          // «Изменить номер» (docs/01_FOUNDATION_AUTH.md
                          // §10.2 D) — same caption link style as "Resend".
                          _ChangeIdentifierLink(
                            label: t.t(
                              flowState.channel == AuthChannel.email
                                  ? 'auth.otp.changeEmail'
                                  : 'auth.otp.changeNumber',
                            ),
                            onTap: () => _returnToEntry(
                              ref.read(onboardingFlowProvider.notifier).changeIdentifier(),
                            ),
                          ),
                          const Spacer(),
                          Padding(
                            padding: const EdgeInsets.only(bottom: 22),
                            child: GavelStrikeButton(
                              label: t.t('auth.otp.submit'),
                              isLoading: flowState.isSubmitting,
                              // AppOtpField.onCompleted already auto-submits
                              // the instant the 6th digit lands (unchanged
                              // stage-1.5 contract). This button — required
                              // by file 07 §6.3's layout and §7.4's
                              // gavel-button list — is the manual fallback:
                              // it re-submits whatever `_currentCode` the
                              // field's onChanged last reported, so it still
                              // works if autofill/paste didn't trigger
                              // onCompleted for some reason.
                              onPressed: () {
                                if (_currentCode.length == 6) _handleCompleted(_currentCode);
                              },
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

/// Caption-sized gold underlined link (identical style to the "Resend
/// code" link below) inside a 44pt-tall hit area (.cursorrules 44x44).
class _ChangeIdentifierLink extends StatelessWidget {
  const _ChangeIdentifierLink({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      onTap: onTap,
      child: ExcludeSemantics(
        child: GestureDetector(
          key: const Key('otp.changeIdentifier'),
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppSizes.touchTarget,
              minWidth: AppSizes.touchTarget,
            ),
            child: Align(
              alignment: Alignment.centerLeft,
              widthFactor: 1,
              child: Text(
                label,
                style: typography.caption.copyWith(
                  color: colors.gold,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ResendCountdown extends StatefulWidget {
  const _ResendCountdown({required this.t, required this.onResend});

  final Translator t;
  final VoidCallback onResend;

  @override
  State<_ResendCountdown> createState() => _ResendCountdownState();
}

class _ResendCountdownState extends State<_ResendCountdown> {
  // file 07 §6.3 doesn't specify the resend cooldown duration — 60s is a
  // conventional default for SMS OTP resend, documented as a judgment call
  // in docs/CHANGELOG.md rather than invented silently.
  static const _totalSeconds = 60;
  Timer? _timer;
  int _remaining = _totalSeconds;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _remaining = _totalSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_remaining <= 1) {
        timer.cancel();
        setState(() => _remaining = 0);
      } else {
        setState(() => _remaining -= 1);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    if (_remaining > 0) {
      final minutes = _remaining ~/ 60;
      final seconds = (_remaining % 60).toString().padLeft(2, '0');
      final label = widget.t.t('auth.otp.resendIn', {'time': '$minutes:$seconds'});
      // Fast-updating (1/sec) text — excluded from the semantics tree so a
      // screen reader doesn't re-announce it every second (a11y review,
      // docs/CHANGELOG.md stage 1.7). The static link below IS announced
      // once it appears.
      return ExcludeSemantics(
        child: Text(label, style: typography.caption.copyWith(color: colors.textSecondary)),
      );
    }

    return GestureDetector(
      onTap: () {
        widget.onResend();
        _startTimer();
      },
      child: Semantics(
        button: true,
        label: widget.t.t('auth.otp.resend'),
        child: ExcludeSemantics(
          child: Text(
            widget.t.t('auth.otp.resend'),
            style: typography.caption.copyWith(
              color: colors.gold,
              decoration: TextDecoration.underline,
            ),
          ),
        ),
      ),
    );
  }
}
