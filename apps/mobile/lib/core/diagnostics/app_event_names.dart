import 'package:lawbid/core/diagnostics/client_sli.dart';

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

  /// Owner row 112: «Not interested» on someone else's post.
  static const postNotInterested = 'post_not_interested';

  // Owner row 87: the client's call hotline.
  static const hotlineRequest = 'hotline_request';
  static const hotlineCancel = 'hotline_cancel';
  static const hotlineLanguages = 'hotline_languages';
  static const hotlineNotify = 'hotline_notify';
  static const hotlineClaim = 'hotline_claim';
  static const hotlineConnected = 'hotline_connected';
  static const hotlineReview = 'hotline_review';
  static const hotlineOfferCase = 'hotline_offer_case';

  /// Б6 (25.11): the six SLO flows as the person sees them
  /// (core/diagnostics/client_sli.dart): `sli_<flow>_<ok|slow|fail>`.
  static String sli(SliFlow flow, SliOutcome outcome) =>
      'sli_${flow.name}_${outcome.name}';

  /// Every `sli_*` name [sli] can give (login, pay, call and push have no
  /// «slow»: only the feed and sending a message have a time goal).
  static const sliNames = <String>{
    'sli_login_ok',
    'sli_login_fail',
    'sli_feed_ok',
    'sli_feed_slow',
    'sli_feed_fail',
    'sli_message_ok',
    'sli_message_slow',
    'sli_message_fail',
    'sli_pay_ok',
    'sli_pay_fail',
    'sli_call_ok',
    'sli_call_fail',
    'sli_push_ok',
    'sli_push_fail',
  };

  /// Б6 / G8: the website's Core Web Vitals rating, sent by
  /// web/js/web_vitals_beacon.js (web-vitals 6.2.3), not by Dart code.
  static const webVitalNames = <String>{
    'web_vital_lcp_good',
    'web_vital_lcp_ni',
    'web_vital_lcp_poor',
    'web_vital_inp_good',
    'web_vital_inp_ni',
    'web_vital_inp_poor',
    'web_vital_cls_good',
    'web_vital_cls_ni',
    'web_vital_cls_poor',
    'web_vital_ttfb_good',
    'web_vital_ttfb_ni',
    'web_vital_ttfb_poor',
  };

  /// Every name the app can send (the document must list each one).
  static const all = <String>{
    hotlineRequest,
    hotlineCancel,
    hotlineLanguages,
    hotlineNotify,
    hotlineClaim,
    hotlineConnected,
    hotlineReview,
    hotlineOfferCase,
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
    postNotInterested,
    ...sliNames,
    ...webVitalNames,
  };
}
