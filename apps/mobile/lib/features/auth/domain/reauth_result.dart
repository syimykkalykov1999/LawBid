import 'package:freezed_annotation/freezed_annotation.dart';

part 'reauth_result.freezed.dart';

/// Result of a `POST /auth/reauth` attempt (file 01 §10.1/§10.5), Phase 4
/// of the auth networking work (docs/CHANGELOG.md) — same union style as
/// [OtpVerifyResult]/[SocialLoginResult] (see those files' doc comments
/// for why a union instead of a bare success/failure) so a reauth-gated
/// screen (e.g. `DeleteAccountController`) can show a precise message per
/// failure mode.
///
/// [invalid] covers everything `AuthService.reauth` maps to
/// `REAUTH_INVALID` server-side (apps/api/src/modules/auth/auth.service.ts):
/// wrong/expired code, and — deliberately, anti-enumeration — an
/// `identifier` that isn't a verified contact on this account at all.
///
/// NOTE: this file's `.freezed.dart` part was NOT generated as part of
/// this change (no `dart` binary available on this bridge, same as every
/// other freezed union added in this codebase) — `dart run build_runner
/// build` is required before this compiles.
@freezed
sealed class ReauthResult with _$ReauthResult {
  const factory ReauthResult.success({required String reauthToken}) = ReauthSuccess;
  const factory ReauthResult.invalid() = ReauthInvalid;
  const factory ReauthResult.rateLimited(int retryAfterSeconds) = ReauthRateLimited;
  const factory ReauthResult.networkError() = ReauthNetworkError;
}
