import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../../core/l10n/api_error_text.dart';
import '../../../core/l10n/l10n_providers.dart';
import '../../../shared/domain/user_role.dart';
import '../../onboarding/application/current_user_controller.dart';
import '../data/auth_repository.dart';
import '../data/sms_code_retriever.dart';
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
    state = state.copyWith(isSubmitting: true, errorMessage: null, autofilledCode: null);
    // SMS Retriever must be listening BEFORE the SMS is sent (§10.2 D).
    if (channel == AuthChannel.phone) _listenForSmsCode(identifier);
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
      _stopSmsListener();
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
    if (state.channel == AuthChannel.phone) _listenForSmsCode(identifier);
    try {
      await ref.read(authRepositoryProvider).requestOtp(identifier, channel: state.channel.wireName);
      return null;
    } catch (e) {
      return errorText(ref.read(translatorProvider), e);
    }
  }

  /// Bumped for every new SMS Retriever session, so a late result from an
  /// older session (a previous number, a cancelled screen) is ignored.
  int _smsSession = 0;

  /// Android SMS Retriever (§10.2 D): when the SMS for [phone] arrives,
  /// the code is shown prefilled and verified without the user typing it.
  /// A no-op on iOS (oneTimeCode keyboard autofill covers it) and tests.
  void _listenForSmsCode(String phone) {
    final retriever = ref.read(smsCodeRetrieverProvider);
    if (!retriever.isSupported) return;
    final session = ++_smsSession;
    retriever.listenForCode().then((code) {
      if (code == null || session != _smsSession || !ref.mounted) return;
      final s = state;
      final stillWaiting = s.step == OnboardingStep.otp &&
          s.channel == AuthChannel.phone &&
          s.identifier == phone &&
          !s.isSubmitting;
      if (!stillWaiting) return;
      state = s.copyWith(autofilledCode: code);
      verifyOtp(code);
    }).catchError((Object _) {
      // Autofill is best-effort; the user can always type the code.
    });
  }

  void _stopSmsListener() {
    _smsSession++;
    final retriever = ref.read(smsCodeRetrieverProvider);
    if (retriever.isSupported) retriever.stop().catchError((Object _) {});
  }

  /// Email magic link (docs/01_FOUNDATION_AUTH.md §10.2 E/F, security
  /// review 2026-09-27; deep link `lawbid://auth/email-code?token=…` or
  /// `https://lawbid.app/auth/email-code?token=…`, see core/deeplinks).
  ///
  /// The link only works together with the verifier this device stored
  /// when it requested the code (`MagicLinkVerifierStore`):
  /// - no verifier here (link opened on another device, or after a
  ///   reinstall) → no request at all; the email step is shown asking to
  ///   use the requesting phone or type the code from the email;
  /// - otherwise `POST /auth/otp/verify-link` on the email code step, with
  ///   the same session/post-sign-in handling and errors as a typed code.
  ///   If the flow no longer knows the address (cold start), a failure
  ///   lands on the email step so the user can request a new code.
  ///
  /// [show] is told which step to display (the caller owns navigation).
  Future<bool> verifyEmailMagicLink(
    String token, {
    required void Function(OnboardingStep step) show,
  }) async {
    _stopSmsListener();
    final t = ref.read(translatorProvider);
    final String? verifier;
    try {
      verifier = await ref.read(magicLinkVerifierStoreProvider).read();
    } catch (_) {
      return _magicLinkToEmailStep(t.t('auth.magicLink.otherDevice'), show);
    }
    if (!ref.mounted) return false;
    if (verifier == null) {
      return _magicLinkToEmailStep(t.t('auth.magicLink.otherDevice'), show);
    }
    // Same device: the address is still known if the flow survived.
    final identifier = state.channel == AuthChannel.email ? state.identifier : null;
    state = OnboardingFlowState(
      step: OnboardingStep.otp,
      channel: AuthChannel.email,
      identifier: identifier,
      isSubmitting: true,
    );
    show(OnboardingStep.otp);
    final result = await ref
        .read(authRepositoryProvider)
        .verifyEmailLink(token: token, verifier: verifier);
    Future<bool> fail(String message) => identifier == null
        ? _magicLinkToEmailStep(message, show)
        : _fail(message);
    return result.when(
      success: (isNewUser) => _afterSignIn(isNewUser: isNewUser),
      invalid: () => fail(t.t('error.api.AUTH_OTP_INVALID')),
      expired: () => fail(t.t('error.api.AUTH_OTP_EXPIRED')),
      locked: () => fail(t.t('error.api.AUTH_OTP_LOCKED')),
      rateLimited: (retryAfterSeconds) =>
          fail(t.t('error.api.retryAfter', {'seconds': '$retryAfterSeconds'})),
      networkError: () => fail(t.t('error.api.NETWORK_ERROR')),
    );
  }

  Future<bool> _magicLinkToEmailStep(
    String message,
    void Function(OnboardingStep step) show,
  ) async {
    final identifier = state.channel == AuthChannel.email ? state.identifier : null;
    state = OnboardingFlowState(
      step: OnboardingStep.email,
      channel: AuthChannel.email,
      identifier: identifier,
      errorMessage: message,
    );
    show(OnboardingStep.email);
    return false;
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
    _stopSmsListener();
    // The magic-link verifier is single-use; drop it once signed in.
    try {
      await ref.read(magicLinkVerifierStoreProvider).clear();
    } catch (_) {
      // Best effort — the server consumes the link token anyway.
    }
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
    if (step != OnboardingStep.otp) _stopSmsListener();
    state = state.copyWith(step: step, errorMessage: null, autofilledCode: null);
  }

  /// «Изменить номер» / "Change number" on the code screen
  /// (docs/01_FOUNDATION_AUTH.md §10.2 D): back to the entry step of the
  /// current channel (phone, or email for an email code). Returns that
  /// step so the screen knows where to navigate.
  OnboardingStep changeIdentifier() {
    final entry = state.channel == AuthChannel.email ? OnboardingStep.email : OnboardingStep.phone;
    goBackTo(entry);
    return entry;
  }

  /// Clears a stale error (e.g. when the user edits the field).
  void clearError() {
    if (state.errorMessage != null) state = state.copyWith(errorMessage: null);
  }
}
