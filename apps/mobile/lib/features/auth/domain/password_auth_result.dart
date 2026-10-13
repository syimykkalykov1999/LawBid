/// How a password operation ended (owner 2026-10-13): sign in with a
/// password, forgot-password code request and reset, setting a password.
/// Plain values rather than a union so a screen can switch on `status`.
enum PasswordAuthStatus {
  success,

  /// Wrong phone / e-mail or password (one answer for both, so nobody can
  /// find out which accounts exist).
  invalidCredentials,
  invalidCode,
  expired,
  locked,
  rateLimited,

  /// The account is suspended or deleted.
  unavailable,

  /// The admin switched password sign-in off.
  providerDisabled,
  networkError,
}

class PasswordAuthResult {
  const PasswordAuthResult(
    this.status, {
    this.retryAfterSeconds = 60,
    this.channel,
  });

  const PasswordAuthResult.success({String? channel})
      : this(PasswordAuthStatus.success, channel: channel);

  final PasswordAuthStatus status;

  /// For `rateLimited`.
  final int retryAfterSeconds;

  /// Where a reset code went: `email` or `phone` (SMS).
  final String? channel;

  bool get isSuccess => status == PasswordAuthStatus.success;
}
