/// Steps of the account-deletion flow (file 01 §10.7: "предупреждение →
/// повторная аутентификация → подтверждение"). Phase 4 of the auth
/// networking work (docs/CHANGELOG.md).
enum DeleteAccountStep {
  /// Irreversibility warning + grace-period explainer — the first thing
  /// the screen shows, before anything destructive is even possible.
  warning,

  /// Owner 2026-10-28: the account password (`POST /auth/reauth` with
  /// `method: password`) — no SMS. «Забыли пароль?» or an account without
  /// a password goes on to [reauthPhone] (the code path).
  reauthPassword,

  /// Reauth sub-step 1: request a code to the account's verified e-mail
  /// (pack E, 25.11: never an SMS — the server sends one only at
  /// registration and «Забыл пароль»). The name stays for the step order.
  /// Biometric (`BiometricAuthService`) is offered here first as a local
  /// speed bump, but never replaces this step — see that class's doc
  /// comment for why the server still requires the OTP either way.
  reauthPhone,

  /// Reauth sub-step 2: enter the 6-digit code, exchanged for a
  /// `reauthToken` via `POST /auth/reauth`.
  reauthCode,

  /// Final confirmation: type the exact confirmation phrase before the
  /// (now reauth-armed) delete button is enabled.
  confirmPhrase,

  /// `DELETE /users/me` in flight.
  submitting,

  /// Deletion accepted — grace-period success message, then sign-out.
  done,
}
