/// Owner 2026-10-22 (checklist §18): every product event the app sends,
/// named exactly as docs/analytics_events.md lists them. The test
/// test/core/diagnostics/app_event_names_test.dart compares this list with
/// the document, so a new event is added in both places or nowhere.
///
/// `AppEvents` (app_events.dart) counts names only — no properties ever
/// leave the phone (the document's property columns describe what the
/// moment means, not a payload). `screen_view` carries the normalised
/// route as its screen.
abstract final class AppEventNames {
  static const appOpen = 'app_open';
  static const screenView = 'screen_view';

  // Authentication and onboarding (docs/01).
  static const otpRequested = 'otp_requested';
  static const loginSuccess = 'login_success';
  static const loginFailure = 'login_failure';
  static const consentsAccepted = 'consents_accepted';
  static const roleSelected = 'role_selected';
  static const contactsVerified = 'contacts_verified';
  static const profileCompleted = 'profile_completed';
  static const onboardingCompleted = 'onboarding_completed';
  static const signupCompleted = 'signup_completed';
  static const logout = 'logout';
  static const accountDeletionRequested = 'account_deletion_requested';
  static const appUpdatePrompted = 'app_update_prompted';

  /// Owner 2026-10-22 (checklist §27): the in-app review prompt was shown.
  static const reviewPrompted = 'review_prompted';

  /// Every name the app can send (the document must list each one).
  static const all = <String>{
    appOpen,
    screenView,
    otpRequested,
    loginSuccess,
    loginFailure,
    consentsAccepted,
    roleSelected,
    contactsVerified,
    profileCompleted,
    onboardingCompleted,
    signupCompleted,
    logout,
    accountDeletionRequested,
    appUpdatePrompted,
    reviewPrompted,
  };
}
