import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/data/auth_repository.dart';
import 'package:lawbid/features/auth/data/magic_link_verifier_store.dart';
import 'package:lawbid/features/auth/domain/account_deletion_result.dart';
import 'package:lawbid/features/auth/domain/otp_verify_result.dart';
import 'package:lawbid/features/auth/domain/password_auth_result.dart';
import 'package:lawbid/features/auth/domain/reauth_result.dart';

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
    this._magicLink, {
    this.confirmOtherDevice,
  });

  /// Owner 2026-10-01 (one phone + one website per account): asks whether
  /// to continue and sign the other device out. Null = never continue.
  final Future<bool> Function(Map<String, dynamic> details)? confirmOtherDevice;

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
          message: _kCancelled,
        );
      }
      return _client.continueLogin(token);
    }
  }

  final AuthApiClient _client;
  final SessionController _session;
  final DeviceInfo _deviceInfo;
  final MagicLinkVerifierStore _magicLink;

  @override
  Future<void> requestOtp(String identifier, {String channel = 'phone'}) async {
    // Email login codes also arrive as a magic link, bound to this device
    // by a fresh verifier (only its SHA-256 leaves the device).
    final linkChallenge =
        channel == 'email' ? await _magicLink.createChallenge() : null;
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
  Future<OtpVerifyResult> signInWithAssistantCode(String code) async {
    try {
      final tokens = await _client.assistantCodeLogin(
        code: code,
        deviceInfo: _deviceInfo,
      );
      await _session.applyTokens(tokens);
      return OtpVerifyResult.success(isNewUser: tokens.isNewUser);
    } on ApiException catch (e) {
      return e.code == ApiErrorCodes.assistantCodeInvalid
          ? const OtpVerifyResult.invalid()
          : _otpFailure(e);
    }
  }

  @override
  Future<OtpVerifyResult> verifyEmailLink({
    required String token,
    required String verifier,
  }) async {
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

  @override
  Future<PasswordAuthResult> signInWithPassword({
    required String identifier,
    required String password,
  }) async {
    try {
      final tokens = await _orContinue(
        () => _client.passwordLogin(
          identifier: identifier,
          password: password,
          deviceInfo: _deviceInfo,
        ),
      );
      await _session.applyTokens(tokens);
      return const PasswordAuthResult.success();
    } on ApiException catch (e) {
      return _passwordFailure(e);
    }
  }

  @override
  Future<({bool registered, bool hasPassword})?> phoneStatus(
    String phone,
  ) async {
    try {
      return await _client.phoneStatus(phone);
    } on ApiException {
      return null;
    }
  }

  @override
  Future<PasswordAuthResult> setPassword(
    String password, {
    String? currentPassword,
    String? reauthToken,
  }) async {
    try {
      await _client.setPassword(
        password,
        currentPassword: currentPassword,
        reauthToken: reauthToken,
      );
      return const PasswordAuthResult.success();
    } on ApiException catch (e) {
      return _passwordFailure(e);
    }
  }

  @override
  Future<PasswordAuthResult> requestPasswordReset(String identifier) async {
    try {
      final channel = await _client.requestPasswordReset(identifier);
      return PasswordAuthResult.success(channel: channel);
    } on ApiException catch (e) {
      return _passwordFailure(e);
    }
  }

  @override
  Future<PasswordAuthResult> resetPassword({
    required String identifier,
    required String code,
    required String newPassword,
  }) async {
    try {
      final tokens = await _orContinue(
        () => _client.confirmPasswordReset(
          identifier: identifier,
          code: code,
          newPassword: newPassword,
          deviceInfo: _deviceInfo,
        ),
      );
      await _session.applyTokens(tokens);
      return const PasswordAuthResult.success();
    } on ApiException catch (e) {
      return _passwordFailure(e);
    }
  }

  static PasswordAuthResult _passwordFailure(ApiException e) {
    switch (e.code) {
      case ApiErrorCodes.authInvalidCredentials:
        return const PasswordAuthResult(PasswordAuthStatus.invalidCredentials);
      case ApiErrorCodes.authOtpInvalid:
        return const PasswordAuthResult(PasswordAuthStatus.invalidCode);
      case ApiErrorCodes.authOtpExpired:
        return const PasswordAuthResult(PasswordAuthStatus.expired);
      case ApiErrorCodes.authOtpLocked:
        return const PasswordAuthResult(PasswordAuthStatus.locked);
      case ApiErrorCodes.authOtpRequestLimit:
      case ApiErrorCodes.rateLimited:
        final retryAfter = e.details?['retryAfterSeconds'];
        return PasswordAuthResult(
          PasswordAuthStatus.rateLimited,
          retryAfterSeconds: retryAfter is int ? retryAfter : 60,
        );
      case ApiErrorCodes.accountSuspended:
      case ApiErrorCodes.accountDeleted:
        return const PasswordAuthResult(PasswordAuthStatus.unavailable);
      case ApiErrorCodes.authProviderDisabled:
      case ApiErrorCodes.featureDisabled:
        return const PasswordAuthResult(PasswordAuthStatus.providerDisabled);
      case ApiErrorCodes.reauthRequired:
      case ApiErrorCodes.reauthInvalid:
        return const PasswordAuthResult(PasswordAuthStatus.reauthRequired);
      default:
        return const PasswordAuthResult(PasswordAuthStatus.networkError);
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

  @override
  Future<void> logout() => _client.logout();

  @override
  Future<void> logoutAll() => _client.logoutAll();

  @override
  Future<List<DeviceSession>> listSessions() => _client.listSessions();

  @override
  Future<void> revokeSession(String sessionId) => _client.endSession(sessionId);

  @override
  Future<ReauthResult> reauthWithOtp({
    required String identifier,
    required String code,
  }) async {
    try {
      final reauthToken =
          await _client.reauth(identifier: identifier, code: code);
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
  Future<AccountDeletionResult> deleteAccount({
    required String reauthToken,
  }) async {
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

/// The user chose not to sign the other device out.
const _kCancelled = 'other-device-cancelled';
