import 'package:flutter/foundation.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

/// What a scanned QR code means for LawBid (owner 2026-10-20). A code is
/// untrusted input: only our own link shapes are acted on inside the app,
/// any other web address is opened in the browser after the user confirms,
/// and everything else is just shown as text.
@immutable
sealed class QrTarget {
  const QrTarget();
}

/// `lawbid.dev/u/<username>` (or `/lawyer/<username>`): a profile.
final class ProfileQrTarget extends QrTarget {
  const ProfileQrTarget(this.username);

  final String username;
}

/// `lawbid.dev/q/<id>`: the website's sign-in code.
final class WebLoginQrTarget extends QrTarget {
  const WebLoginQrTarget(this.qrId);

  final String qrId;
}

/// `lawbid.dev/g/<token>`: a group invitation.
final class GroupInviteQrTarget extends QrTarget {
  const GroupInviteQrTarget(this.token);

  final String token;
}

/// Another screen of the app (a case, a post, an invite code).
final class AppScreenQrTarget extends QrTarget {
  const AppScreenQrTarget(this.location);

  /// go_router location.
  final String location;
}

/// A web address that is not ours.
final class ExternalUrlQrTarget extends QrTarget {
  const ExternalUrlQrTarget(this.uri);

  final Uri uri;
}

/// Anything else: shown as text, never acted on.
final class TextQrTarget extends QrTarget {
  const TextQrTarget(this.text);

  final String text;
}

/// Classifies the raw text of a scanned code. [host] is the app's own link
/// host (`lawbid.dev`).
QrTarget classifyQr(String raw, {required String host}) {
  final text = raw.trim();
  if (text.isEmpty) return TextQrTarget(raw);
  final uri = Uri.tryParse(text);
  if (uri == null) return TextQrTarget(text);

  final link = parseDeepLink(uri, host: host);
  switch (link) {
    case ProfileDeepLink(:final username):
      return ProfileQrTarget(username);
    case WebLoginDeepLink(:final qrId):
      return WebLoginQrTarget(qrId);
    case GroupInviteDeepLink(:final token):
      return GroupInviteQrTarget(token);
    case ReferralDeepLink(:final code):
      return AppScreenQrTarget(
        '${AppRoutes.referral}?code=${Uri.encodeQueryComponent(code)}',
      );
    case ContentDeepLink(:final kind, :final id):
      return kind == ContentKind.lawyer
          ? ProfileQrTarget(id)
          : AppScreenQrTarget(ContentDeepLink(kind, id).location);
    case EmailCodeDeepLink() || TabDeepLink():
      // A sign-in credential or a web-only address is never taken from a
      // picture.
      return TextQrTarget(text);
    case null:
      break;
  }

  final scheme = uri.scheme.toLowerCase();
  if ((scheme == 'https' || scheme == 'http') && uri.host.isNotEmpty) {
    return ExternalUrlQrTarget(uri);
  }
  return TextQrTarget(text);
}
