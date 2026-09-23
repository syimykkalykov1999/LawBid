import 'package:freezed_annotation/freezed_annotation.dart';

part 'account_deletion_result.freezed.dart';

/// Result of `DELETE /users/me` (file 01 §10.7), Phase 4 of the auth
/// networking work (docs/CHANGELOG.md). Same union style as the other
/// auth result types in this directory — see [ReauthResult]'s doc comment.
///
/// [reauthRequired]/[reauthInvalid] mirror `ReauthGuard`'s two failure
/// shapes (apps/api/src/modules/auth/guards/reauth.guard.ts): no
/// `X-Reauth-Token` header at all (`REAUTH_REQUIRED`, 403) vs. a
/// header that's missing/expired/already-used/bound to a different
/// session (`REAUTH_INVALID`, 401) — `DeleteAccountController` treats both
/// the same way today (send the caller back to the reauth step), kept as
/// two variants so a future UI can distinguish "you never proved it's you"
/// from "that proof already expired, try again".
///
/// NOTE: this file's `.freezed.dart` part was NOT generated as part of
/// this change (no `dart` binary available on this bridge) — `dart run
/// build_runner build` is required before this compiles.
@freezed
sealed class AccountDeletionResult with _$AccountDeletionResult {
  const factory AccountDeletionResult.success() = AccountDeletionSuccess;
  const factory AccountDeletionResult.reauthRequired() = AccountDeletionReauthRequired;
  const factory AccountDeletionResult.reauthInvalid() = AccountDeletionReauthInvalid;
  const factory AccountDeletionResult.networkError() = AccountDeletionNetworkError;
}
