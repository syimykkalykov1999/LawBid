import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/security/turnstile_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/security/turnstile_web.dart'
    as impl;

/// 2026-10-24 (abuse batch D, item 4): Cloudflare Turnstile on the web
/// build. Gives a single-use token for a site key, or null. The browser
/// implementation is core/security/turnstile_web.dart; on the phones the
/// stub answers null (they are protected by App Check). Overridable in
/// tests with a fake provider.
typedef TurnstileTokenProvider = Future<String?> Function(String siteKey);

final turnstileTokenProvider = Provider<TurnstileTokenProvider>(
  (ref) => impl.runTurnstile,
);

/// The bootstrap `app_config` key that carries the public site key (set
/// only while `security.turnstile.mode` is monitor / enforce).
const kTurnstileSiteKeyConfig = 'turnstile.site_key';

/// The site key from an `app_config` map, or null when absent / blank.
String? turnstileSiteKeyFrom(Map<String, String> appConfig) {
  final v = appConfig[kTurnstileSiteKeyConfig]?.trim();
  return v == null || v.isEmpty ? null : v;
}
