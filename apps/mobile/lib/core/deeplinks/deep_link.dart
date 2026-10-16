import 'package:flutter/foundation.dart';

/// The app's custom URL scheme: `lawbid://…` (docs/01_FOUNDATION_AUTH.md
/// §10.2 E/F magic link). Registered in AndroidManifest.xml and the iOS
/// Info.plist `CFBundleURLTypes`.
const String deepLinkScheme = 'lawbid';

/// A parsed, validated deep link (docs/01_FOUNDATION_AUTH.md §12:
/// `lawbid.dev/case/:id`, `/lawyer/:username`, `/post/:id`, magic sign-in
/// links). Everything else is ignored — a link is untrusted input from
/// outside the app, so only these exact shapes are ever acted on.
@immutable
sealed class DeepLink {
  const DeepLink();
}

/// `…/auth/email-code?token=<43 base64url chars>` — the magic link in the
/// sign-in email (§10.2 E/F, security review 2026-09-27). The token is
/// one-time and only redeemable together with the verifier stored on the
/// device that requested the code; the link never carries the email or the
/// code itself.
final class EmailCodeDeepLink extends DeepLink {
  const EmailCodeDeepLink({required this.token});

  final String token;

  @override
  bool operator ==(Object other) =>
      other is EmailCodeDeepLink && other.token == token;

  @override
  int get hashCode => token.hashCode;

  // Never print the token (it is half of a sign-in credential).
  @override
  String toString() => 'EmailCodeDeepLink(token: <redacted>)';
}

/// `…/r/<CODE>` or `lawbid://referral/<CODE>` — an invite link: opens
/// Invite & earn with the code filled in (Owner 2026-10-02).
final class ReferralDeepLink extends DeepLink {
  const ReferralDeepLink(this.code);

  final String code;

  @override
  bool operator ==(Object other) =>
      other is ReferralDeepLink && other.code == code;

  @override
  int get hashCode => code.hashCode;
}

enum ContentKind { caseItem, lawyer, post }

/// `/case/:id`, `/lawyer/:username`, `/post/:id` — content that lives in
/// files 03–05 (opened by the router).
final class ContentDeepLink extends DeepLink {
  const ContentDeepLink(this.kind, this.id);

  final ContentKind kind;
  final String id;

  /// In-app go_router location for this link.
  String get location => switch (kind) {
        ContentKind.caseItem => '/case/${Uri.encodeComponent(id)}',
        ContentKind.lawyer => '/lawyer/${Uri.encodeComponent(id)}',
        ContentKind.post => '/post/${Uri.encodeComponent(id)}',
      };

  @override
  bool operator ==(Object other) =>
      other is ContentDeepLink && other.kind == kind && other.id == id;

  @override
  int get hashCode => Object.hash(kind, id);

  @override
  String toString() => 'ContentDeepLink($kind, $id)';
}

/// Web only: the address of a main tab (`/feed`, `/search`, `/mine`,
/// `/profile`), so a browser refresh reopens the same tab instead of the
/// feed (owner 2026-10-16).
final class TabDeepLink extends DeepLink {
  const TabDeepLink(this.location);

  /// In-app go_router location.
  final String location;

  @override
  bool operator ==(Object other) =>
      other is TabDeepLink && other.location == location;

  @override
  int get hashCode => location.hashCode;
}

const _webTabs = {'/feed', '/search', '/mine', '/profile'};

/// Magic-link token: 32 random bytes, base64url without padding.
final _tokenPattern = RegExp(r'^[A-Za-z0-9_-]{43}$');

final _referralCodePattern = RegExp(r'^[A-Za-z0-9]{4,24}$');

/// Case / post ids are UUIDs server-side (.cursorrules: UUID only); a
/// slightly wider safe charset keeps the parser independent of that.
final _idPattern = RegExp(r'^[A-Za-z0-9-]{1,64}$');

/// docs/01_FOUNDATION_AUTH.md §12: "3-30 символов, латиница, цифры, `_` и `.`".
final _usernamePattern = RegExp(r'^[A-Za-z0-9_.]{3,30}$');

/// A dev web server (http://localhost:…) — the only plain http link taken.
bool _isLoopback(String host) =>
    host == 'localhost' || host == '127.0.0.1' || host == '[::1]';

/// Parses [uri] into a [DeepLink], or null when it isn't one of ours.
///
/// Accepted forms (both route identically):
/// - `lawbid://auth/email-code?token=…`, `lawbid://case/<id>` …
///   (for the custom scheme the "host" is the first path segment);
/// - `https://<host>/auth/email-code?…`, `https://<host>/case/<id>` … where
///   `<host>` is [host] or `www.<host>` (universal / App Links).
DeepLink? parseDeepLink(
  Uri uri, {
  required String host,
  bool webTabs = false,
}) {
  final List<String> segments;
  final scheme = uri.scheme.toLowerCase();
  if (scheme == deepLinkScheme) {
    segments = [
      if (uri.host.isNotEmpty) uri.host.toLowerCase(),
      ...uri.pathSegments,
    ];
  } else if (scheme == 'https' || (scheme == 'http' && _isLoopback(uri.host))) {
    final linkHost = uri.host.toLowerCase();
    final expected = host.toLowerCase();
    if (linkHost != expected && linkHost != 'www.$expected') return null;
    segments = uri.pathSegments;
  } else {
    return null;
  }
  final parts = segments.where((s) => s.isNotEmpty).toList();
  if (parts.isEmpty) return null;

  if (parts.length == 2 && parts[0] == 'auth' && parts[1] == 'email-code') {
    final String token;
    try {
      token = uri.queryParameters['token'] ?? '';
    } catch (_) {
      return null; // malformed query encoding
    }
    if (!_tokenPattern.hasMatch(token)) return null;
    return EmailCodeDeepLink(token: token);
  }

  if (webTabs && parts.length == 1 && _webTabs.contains('/${parts[0]}')) {
    return TabDeepLink('/${parts[0]}');
  }

  if (parts.length != 2) return null;
  final id = parts[1];
  return switch (parts[0]) {
    'r' ||
    'referral' when _referralCodePattern.hasMatch(id) =>
      ReferralDeepLink(id.toUpperCase()),
    'case' when _idPattern.hasMatch(id) =>
      ContentDeepLink(ContentKind.caseItem, id),
    'post' when _idPattern.hasMatch(id) =>
      ContentDeepLink(ContentKind.post, id),
    'lawyer'
        when _usernamePattern
            .hasMatch(id.startsWith('@') ? id.substring(1) : id) =>
      ContentDeepLink(
        ContentKind.lawyer,
        id.startsWith('@') ? id.substring(1) : id,
      ),
    _ => null,
  };
}
