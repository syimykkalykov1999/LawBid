/// Owner 2026-10-28: the answer to «Подтвердите, что это вы» with the
/// account password (`POST /auth/reauth {method: password}`).
sealed class PasswordReauthOutcome {
  const PasswordReauthOutcome();
}

/// The single-use 5-minute reauth token (same as the SMS path).
final class PasswordReauthOk extends PasswordReauthOutcome {
  const PasswordReauthOk(this.reauthToken);

  final String reauthToken;
}

/// Wrong password.
final class PasswordReauthWrong extends PasswordReauthOutcome {
  const PasswordReauthWrong();
}

/// Too many tries / locked for a while (the SMS fallback stays open).
final class PasswordReauthLocked extends PasswordReauthOutcome {
  const PasswordReauthLocked(this.retryAfterSeconds);

  final int retryAfterSeconds;
}

/// Use the code instead: the account has no password, must use a passkey,
/// or the server is one version older and only knows the code path.
final class PasswordReauthUseCode extends PasswordReauthOutcome {
  const PasswordReauthUseCode();
}

/// No connection / unexpected answer.
final class PasswordReauthNetworkError extends PasswordReauthOutcome {
  const PasswordReauthNetworkError();
}
