import '../../../core/network/api_error.dart';
import '../../../core/session/session_providers.dart';
import '../domain/otp_verify_result.dart';
import '../domain/social_login_result.dart';
import 'auth_api_client.dart';
import 'auth_dtos.dart';
import 'auth_repository.dart';
import 'social_auth_native_client.dart';

/// Real dio-backed [AuthRepository] (docs/CHANGELOG.md, stage-1.7-auth —
/// replaces `StubAuthRepository` as `authRepositoryProvider`'s default).
///
/// Onboarding is phone-only today (file 07 §6), so [_channel] is hardcoded
/// to `'phone'` here rather than threaded through the interface — a future
/// email/social pass extends [AuthRepository] rather than this class
/// guessing at a channel no screen can select yet.
class RealAuthRepository implements AuthRepository {
  RealAuthRepository(this._client, this._session, this._deviceInfo, this._nativeClient);

  final AuthApiClient _client;
  final SessionController _session;
  final DeviceInfo _deviceInfo;
  final SocialAuthNativeClient _nativeClient;

  static const _channel = 'phone';

  @override
  Future<void> requestOtp(String phoneNumber) {
    return _client.requestOtp(channel: _channel, identifier: phoneNumber);
  }

  @override
  Future<OtpVerifyResult> verifyOtp({required String phoneNumber, required String code}) async {
    try {
      final tokens = await _client.verifyOtp(
        channel: _channel,
        identifier: phoneNumber,
        code: code,
        deviceInfo: _deviceInfo,
      );
      await _session.applyTokens(tokens);
      return OtpVerifyResult.success(isNewUser: tokens.isNewUser);
    } on ApiException catch (e) {
      switch (e.code) {
        case ApiErrorCodes.authOtpInvalid:
          return const OtpVerifyResult.invalid();
        case ApiErrorCodes.authOtpExpired:
          return const OtpVerifyResult.expired();
        case ApiErrorCodes.authOtpLocked:
          return const OtpVerifyResult.locked();
        case ApiErrorCodes.authOtpRequestLimit:
        case ApiErrorCodes.rateLimited:
          final retryAfter = e.details?['retryAfterSeconds'];
          return OtpVerifyResult.rateLimited(retryAfter is int ? retryAfter : 60);
        default:
          return const OtpVerifyResult.networkError();
      }
    }
  }

  /// Phase 3 (docs/CHANGELOG.md): native sign-in via [_nativeClient],
  /// exchanged against `POST /auth/social`. Shared by [signInWithApple]
  /// and [signInWithGoogle] — the only difference between the two is
  /// which native-client method [nativeSignIn] calls.
  Future<SocialLoginResult> _signInWithSocial(
    Future<SocialCredential> Function() nativeSignIn,
  ) async {
    final SocialCredential credential;
    try {
      credential = await nativeSignIn();
    } on SocialAuthCancelledException {
      return const SocialLoginResult.cancelled();
    }
    try {
      final tokens = await _client.socialLogin(
        SocialLoginPayload(
          provider: credential.provider,
          idToken: credential.idToken,
          nonce: credential.nonce,
          firstName: credential.firstName,
          lastName: credential.lastName,
          deviceInfo: _deviceInfo,
        ),
      );
      await _session.applyTokens(tokens);
      return SocialLoginResult.success(isNewUser: tokens.isNewUser);
    } on ApiException catch (e) {
      switch (e.code) {
        case ApiErrorCodes.authSocialTokenInvalid:
          return const SocialLoginResult.invalidToken();
        // Both map to the same UI-facing variant — from the app's
        // perspective "the provider is off" and "the provider is
        // temporarily unreachable" call for the same message (retry
        // another method), even though the backend distinguishes them.
        case ApiErrorCodes.authProviderDisabled:
        case ApiErrorCodes.authSocialProviderUnavailable:
          return const SocialLoginResult.providerDisabled();
        case ApiErrorCodes.accountExistsUseOtherMethod:
          final details = e.details;
          final methods = details?['availableMethods'];
          return SocialLoginResult.accountExists(
            maskedIdentifier: details?['maskedIdentifier'] as String? ?? '',
            availableMethods: methods is List
                ? methods.map((m) => m.toString()).toList()
                : const [],
          );
        case ApiErrorCodes.accountSuspended:
          return const SocialLoginResult.suspended();
        case ApiErrorCodes.accountDeleted:
          return const SocialLoginResult.deleted();
        default:
          return const SocialLoginResult.networkError();
      }
    }
  }

  @override
  Future<SocialLoginResult> signInWithApple() =>
      _signInWithSocial(_nativeClient.signInWithApple);

  @override
  Future<SocialLoginResult> signInWithGoogle() =>
      _signInWithSocial(_nativeClient.signInWithGoogle);

  @override
  Future<void> logout() => _client.logout();
}
