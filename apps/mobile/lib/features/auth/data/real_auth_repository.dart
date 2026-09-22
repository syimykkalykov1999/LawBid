import '../../../core/network/api_error.dart';
import '../../../core/session/session_providers.dart';
import '../domain/otp_verify_result.dart';
import 'auth_api_client.dart';
import 'auth_dtos.dart';
import 'auth_repository.dart';

/// Real dio-backed [AuthRepository] (docs/CHANGELOG.md, stage-1.7-auth —
/// replaces `StubAuthRepository` as `authRepositoryProvider`'s default).
///
/// Onboarding is phone-only today (file 07 §6), so [_channel] is hardcoded
/// to `'phone'` here rather than threaded through the interface — a future
/// email/social pass extends [AuthRepository] rather than this class
/// guessing at a channel no screen can select yet.
class RealAuthRepository implements AuthRepository {
  RealAuthRepository(this._client, this._session, this._deviceInfo);

  final AuthApiClient _client;
  final SessionController _session;
  final DeviceInfo _deviceInfo;

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

  @override
  Future<void> logout() => _client.logout();
}
