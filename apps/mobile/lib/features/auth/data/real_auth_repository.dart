import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../../core/network/api_error.dart';
import '../../../core/session/session_providers.dart';
import '../domain/account_deletion_result.dart';
import '../domain/otp_verify_result.dart';
import '../domain/reauth_result.dart';
import '../domain/social_login_result.dart';
import 'auth_api_client.dart';
import 'auth_dtos.dart';
import 'auth_repository.dart';
import 'magic_link_verifier_store.dart';
import 'social_auth_native_client.dart';

/// Real dio-backed [AuthRepository] (docs/CHANGELOG.md, stage-1.7-auth —
/// replaces `StubAuthRepository` as `authRepositoryProvider`'s default).
///
/// Stage 1.7 mobile: OTP sign-in takes a `channel` (`'phone'` | `'email'`,
/// file 01 §10.2 C-F) instead of the former hardcoded phone channel.
class RealAuthRepository implements AuthRepository {
  RealAuthRepository(
    this._client,
    this._session,
    this._deviceInfo,
    this._nativeClient,
    this._magicLink, {
    this.confirmOtherDevice,
  });

  /// Owner 2026-10-01 (one phone + one website per account): asks whether
  /// to continue and sign the other device out. Null = never continue.
  final Future<bool> Function(Map<String, dynamic> details)?
      confirmOtherDevice;

  /// A 409 AUTH_OTHER_DEVICE_ACTIVE becomes the tokens after the user
  /// confirmed, or rethrows.
  Future<AuthTokensResult> _orContinue(
    Future<AuthTokensResult> Function() signIn,
  ) async {
    try {
      return await signIn();
    } on ApiException catch (e) {
      if (e.code != ApiErrorCodes.authOtherDeviceActive) rethrow;
      final details = e.details ?? const <String, dynamic>{};
      final token = details['pendingToken'];
      final ask = confirmOtherDevice;
      if (token is! String || ask == null || !await ask(details)) {
        // The code was used up: the user signs in again to continue.
        throw const ApiException(
          code: ApiErrorCodes.authOtpExpired,
          message: 'cancelled',
        );
      }
      return _client.continueLogin(token);
    }
  }

  final AuthApiClient _client;
  final SessionController _session;
  final DeviceInfo _deviceInfo;
  final SocialAuthNativeClient _nativeClient;
  final MagicLinkVerifierStore _magicLink;

  @override
  Future<void> requestOtp(String identifier, {String channel = 'phone'}) async {
    // Email login codes also arrive as a magic link, bound to this device
    // by a fresh verifier (only its SHA-256 leaves the device).
    final linkChallenge = channel == 'email' ? await _magicLink.createChallenge() : null;
    await _client.requestOtp(
      channel: channel,
      identifier: identifier,
      linkChallenge: linkChallenge,
    );
  }

  @override
  Future<OtpVerifyResult> verifyOtp({
    required String identifier,
    required String code,
    String channel = 'phone',
  }) async {
    try {
      final tokens = await _orContinue(
        () => _client.verifyOtp(
          channel: channel,
          identifier: identifier,
          code: code,
          deviceInfo: _deviceInfo,
        ),
      );
      await _session.applyTokens(tokens);
      return OtpVerifyResult.success(isNewUser: tokens.isNewUser);
    } on ApiException catch (e) {
      return _otpFailure(e);
    }
  }

  @override
  Future<OtpVerifyResult> verifyEmailLink({required String token, required String verifier}) async {
    try {
      final tokens = await _orContinue(
        () => _client.verifyOtpLink(
          token: token,
          verifier: verifier,
          deviceInfo: _deviceInfo,
        ),
      );
      await _session.applyTokens(tokens);
      return OtpVerifyResult.success(isNewUser: tokens.isNewUser);
    } on ApiException catch (e) {
      return _otpFailure(e);
    }
  }

  static OtpVerifyResult _otpFailure(ApiException e) {
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
        api.SocialLoginDto(
          provider: api.SocialLoginDtoProvider.fromJson(credential.provider),
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

  @override
  Future<void> logoutAll() => _client.logoutAll();

  @override
  Future<List<DeviceSession>> listSessions() => _client.listSessions();

  @override
  Future<void> revokeSession(String sessionId) => _client.endSession(sessionId);

  @override
  Future<ReauthResult> reauthWithOtp({required String identifier, required String code}) async {
    try {
      final reauthToken = await _client.reauth(identifier: identifier, code: code);
      return ReauthResult.success(reauthToken: reauthToken);
    } on ApiException catch (e) {
      switch (e.code) {
        case ApiErrorCodes.reauthInvalid:
          return const ReauthResult.invalid();
        case ApiErrorCodes.authOtpRequestLimit:
        case ApiErrorCodes.rateLimited:
          final retryAfter = e.details?['retryAfterSeconds'];
          return ReauthResult.rateLimited(retryAfter is int ? retryAfter : 60);
        default:
          return const ReauthResult.networkError();
      }
    }
  }

  @override
  Future<AccountDeletionResult> deleteAccount({required String reauthToken}) async {
    try {
      await _client.deleteAccount(reauthToken: reauthToken);
      // docs/01_FOUNDATION_AUTH.md §10.7 + AccountDeletionService
      // (apps/api): the server revokes every session for this account,
      // including the caller's own, as part of a successful deletion
      // request — clear local session state now, there will be no further
      // authenticated call to piggyback this on.
      await _session.clear();
      return const AccountDeletionResult.success();
    } on ApiException catch (e) {
      switch (e.code) {
        case ApiErrorCodes.reauthRequired:
          return const AccountDeletionResult.reauthRequired();
        case ApiErrorCodes.reauthInvalid:
          return const AccountDeletionResult.reauthInvalid();
        default:
          return const AccountDeletionResult.networkError();
      }
    }
  }
}
