import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/l10n/api_error_text.dart';
import '../../../core/l10n/l10n_providers.dart';
import '../../../shared/domain/user_role.dart';
import '../../onboarding/application/current_user_controller.dart';
import '../data/auth_repository.dart';
import '../domain/onboarding_flow_state.dart';
import '../domain/onboarding_step.dart';
import '../domain/otp_verify_result.dart';
import '../domain/social_login_result.dart';
import 'auth_providers.dart';

part 'onboarding_flow.g.dart';

/// Drives the pre-session sign-in screens: welcome → phone|email → otp,
/// plus Apple/Google. After a successful sign-in it waits for
/// `GET /users/me` so AppRouterGuard's next decision already sees the
/// account (stage 1.7 mobile); where the user goes next — onboarding step
/// or feed — is decided by the guard, not here.
///
/// `keepAlive`: the phone/email screen and the code screen are separate
/// routes; the identifier must survive the push between them.
@Riverpod(keepAlive: true)
class OnboardingFlow extends _$OnboardingFlow {
  @override
  OnboardingFlowState build() => const OnboardingFlowState();

  /// Welcome screen's "Продолжить с телефоном" — screen 1 → 2.
  void goToPhoneStep() {
    state = state.copyWith(step: OnboardingStep.phone, channel: AuthChannel.phone, errorMessage: null);
  }

  /// Email sign-in entry (file 01 §10.2 E).
  void goToEmailStep() {
    state = state.copyWith(step: OnboardingStep.email, channel: AuthChannel.email, errorMessage: null);
  }

  Future<bool> submitPhoneNumber(String e164Phone) =>
      _requestCode(AuthChannel.phone, e164Phone);

  Future<bool> submitEmail(String email) =>
      _requestCode(AuthChannel.email, email.trim().toLowerCase());

  Future<bool> _requestCode(AuthChannel channel, String identifier) async {
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    try {
      await ref.read(authRepositoryProvider).requestOtp(identifier, channel: channel.wireName);
      state = state.copyWith(
        step: OnboardingStep.otp,
        channel: channel,
        identifier: identifier,
        isSubmitting: false,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        errorMessage: errorText(ref.read(translatorProvider), e),
      );
      return false;
    }
  }

  /// Resend the code. Returns an error message, or null on success.
  Future<String?> resendOtp() async {
    final identifier = state.identifier;
    if (identifier == null) return null;
    try {
      await ref.read(authRepositoryProvider).requestOtp(identifier, channel: state.channel.wireName);
      return null;
    } catch (e) {
      return errorText(ref.read(translatorProvider), e);
    }
  }

  /// Verifies [code]; on success sets `step` to [OnboardingStep.role] (new
  /// user) or [OnboardingStep.completed] (returning user) — the screens
  /// read it back, and the guard corrects the destination either way.
  Future<bool> verifyOtp(String code) async {
    final identifier = state.identifier;
    if (identifier == null) return false;
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    final t = ref.read(translatorProvider);
    final result = await ref.read(authRepositoryProvider).verifyOtp(
          identifier: identifier,
          code: code,
          channel: state.channel.wireName,
        );
    return result.when(
      success: (isNewUser) => _afterSignIn(isNewUser: isNewUser),
      invalid: () => _fail(t.t('error.api.AUTH_OTP_INVALID')),
      expired: () => _fail(t.t('error.api.AUTH_OTP_EXPIRED')),
      locked: () => _fail(t.t('error.api.AUTH_OTP_LOCKED')),
      rateLimited: (retryAfterSeconds) =>
          _fail(t.t('error.api.retryAfter', {'seconds': '$retryAfterSeconds'})),
      networkError: () => _fail(t.t('error.api.NETWORK_ERROR')),
    );
  }

  Future<bool> _fail(String message) async {
    state = state.copyWith(isSubmitting: false, errorMessage: message);
    return false;
  }

  Future<bool> _afterSignIn({required bool isNewUser}) async {
    await ref.read(currentUserControllerProvider.notifier).ensureLoaded();
    state = state.copyWith(
      isSubmitting: false,
      step: isNewUser ? OnboardingStep.role : OnboardingStep.completed,
    );
    return true;
  }

  /// Welcome screen's Apple button (file 07 §6.1). A cancelled native
  /// sheet is not an error — no `errorMessage` is set for it.
  Future<bool> signInWithApple() => _signInWithSocial((repo) => repo.signInWithApple());

  /// Same as [signInWithApple], via Google.
  Future<bool> signInWithGoogle() => _signInWithSocial((repo) => repo.signInWithGoogle());

  Future<bool> _signInWithSocial(
    Future<SocialLoginResult> Function(AuthRepository) signIn,
  ) async {
    state = state.copyWith(isSubmitting: true, errorMessage: null);
    final result = await signIn(ref.read(authRepositoryProvider));
    final t = ref.read(translatorProvider);
    return result.when(
      success: (isNewUser) => _afterSignIn(isNewUser: isNewUser),
      cancelled: () async {
        state = state.copyWith(isSubmitting: false);
        return false;
      },
      invalidToken: () => _fail(t.t('auth.social.error.invalidToken')),
      providerDisabled: () => _fail(t.t('auth.social.error.providerDisabled')),
      accountExists: (maskedIdentifier, availableMethods) => _fail(
        t.t('auth.social.error.accountExists', {
          'identifier': maskedIdentifier,
          'methods': availableMethods.join(', '),
        }),
      ),
      suspended: () => _fail(t.t('auth.social.error.suspended')),
      deleted: () => _fail(t.t('auth.social.error.deleted')),
      networkError: () => _fail(t.t('auth.social.error.network')),
    );
  }

  /// Role step's local card selection (before "Continue" posts it).
  void selectRole(UserRole role) {
    state = state.copyWith(selectedRole: role);
  }

  /// Back buttons on phone/email/otp — moves the step backward without
  /// losing what's already been entered.
  void goBackTo(OnboardingStep step) {
    state = state.copyWith(step: step, errorMessage: null);
  }

  /// Clears a stale error (e.g. when the user edits the field).
  void clearError() {
    if (state.errorMessage != null) state = state.copyWith(errorMessage: null);
  }
}
