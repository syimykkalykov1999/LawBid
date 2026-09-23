/// Steps of the account-deletion flow (file 01 §10.7: "предупреждение →
/// повторная аутентификация → подтверждение"). Phase 4 of the auth
/// networking work (docs/CHANGELOG.md).
enum DeleteAccountStep {
  /// Irreversibility warning + grace-period explainer — the first thing
  /// the screen shows, before anything destructive is even possible.
  warning,

  /// Reauth sub-step 1: enter the phone number verified on this account
  /// (there is no `GET /users/me` yet to prefill it, see
  /// `AuthRepository.reauthWithOtp`'s doc comment) and request a code.
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
