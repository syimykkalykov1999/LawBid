import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-11-08: opens Persona's hosted ID + selfie page the server
/// handed out — the in-app browser on the phone (Custom Tabs /
/// SFSafariViewController, which allow the camera), this tab on the web
/// with Persona's `redirect-uri` back to the wizard. Returns false when
/// nothing opened it (not Persona's https page, no browser, an error).
Future<bool> openIdentityCheckPage(Uri url, {Uri? webReturn}) async {
  if (!isIdentityCheckUrl(url)) return false;
  try {
    return await launchUrl(
      kIsWeb ? withReturn(url, webReturn ?? Uri.base) : url,
      mode: kIsWeb ? LaunchMode.platformDefault : LaunchMode.inAppBrowserView,
      webOnlyWindowName: kIsWeb ? '_self' : null,
    );
  } on Object {
    return false;
  }
}

/// Only Persona's own hosted-flow host is opened.
bool isIdentityCheckUrl(Uri url) =>
    url.scheme == 'https' && url.host == 'inquiry.withpersona.com';

/// Persona's hosted flow returns to `redirect-uri` when it is finished.
Uri withReturn(Uri url, Uri back) => url.replace(
  queryParameters: {...url.queryParameters, 'redirect-uri': back.toString()},
);
