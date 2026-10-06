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
