import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// How Stripe's hosted pages (checkout, card/subscription portal) open.
///
/// Store release 2026-10-06: Apple lets US apps send buyers to a payment
/// page outside the App Store's in-app purchase only as a link that opens
/// in the browser (Safari), not inside the app, so iOS uses the external
/// browser. Android keeps the in-app browser tab (Custom Tabs).
LaunchMode paymentPageLaunchMode([TargetPlatform? platform]) =>
    (platform ?? defaultTargetPlatform) == TargetPlatform.iOS
        ? LaunchMode.externalApplication
        : LaunchMode.inAppBrowserView;

/// Opens a payment page (Stripe Checkout, portal, Connect onboarding) the
/// server handed out. Owner 2026-10-19 («нажимаю на оплату не переходит»):
/// returns false when nothing opened it — not https, no browser, a platform
/// error — so the caller always says so instead of doing nothing.
///
/// Web: the page opens in THIS tab. A new window opened after the API round
/// trip is blocked by popup blockers (Safari) while url_launcher still
/// reports success; the checkout's return URL brings the user back.
Future<bool> openPaymentPage(Uri url) async {
  // Only https in production; the dev payment page is http://localhost.
  final okScheme =
      url.scheme == 'https' || (kDebugMode && url.scheme == 'http');
  if (!okScheme || url.host.isEmpty) return false;
  try {
    return await launchUrl(
      url,
      mode: kIsWeb ? LaunchMode.platformDefault : paymentPageLaunchMode(),
      webOnlyWindowName: kIsWeb ? '_self' : null,
    );
  } on Object {
    return false;
  }
}
