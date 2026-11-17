import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:lawbid/core/platform/web_isolation_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/web_isolation_web.dart'
    as impl;
import 'package:shared_preferences/shared_preferences.dart';

/// Owner row 173 (2026-11-14): cross-origin isolation of the website, so
/// the skwasm engine draws on a worker thread (admin switch
/// `web.cross_origin_isolation`, off by default; admin → Config).
///
/// The headers come from the site's own service worker (`web/coi_sw.js`),
/// which `web/boot_head.js` registers or removes before the engine starts,
/// from the answer kept here (shared_preferences = localStorage key
/// `flutter.web_cross_origin_isolation`). A new answer is also handed to
/// the page at once (`window.__lbCoi`), so turning it off takes effect on
/// the next page load. Phones are untouched.
/// docs/dev/COOP_COEP_TEST_2026-11-14.md.
abstract final class WebIsolation {
  /// The bootstrap `app_config` key (api: app-settings.defaults.ts).
  static const configKey = 'web.cross_origin_isolation';
  static const _prefsKey = 'web_cross_origin_isolation';

  static SharedPreferences? _prefs;

  /// Tests: act as the website.
  @visibleForTesting
  static bool forceWeb = false;

  /// Tests: stands in for `window.__lbCoi`.
  @visibleForTesting
  static void Function({required bool on})? debugTellPage;

  static bool get _web => kIsWeb || forceWeb;

  /// At start, before `runApp`.
  static void start(SharedPreferences prefs) {
    if (!_web) return;
    _prefs = prefs;
  }

  /// With the `app_config` of every bootstrap answer.
  static void apply(Map<String, String> config) {
    if (!_web) return;
    final prefs = _prefs;
    if (prefs == null) return;
    final on = config[configKey] == 'true';
    if (prefs.getBool(_prefsKey) == on) return;
    // Written at once (localStorage), read by boot_head.js on the next load.
    prefs.setBool(_prefsKey, on).ignore();
    (debugTellPage ?? impl.tellPage)(on: on);
  }

  /// Back to the start state (tests).
  @visibleForTesting
  static void reset() {
    _prefs = null;
    forceWeb = false;
    debugTellPage = null;
  }
}
