import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:flutter/semantics.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// D1-49 (13.11): screen readers on the website. Flutter web builds its
/// semantics tree (the labels VoiceOver, TalkBack and NVDA read) only after
/// the visitor finds a hidden 1-px «Enable accessibility» button. The
/// documented switch is `SemanticsBinding.instance.ensureSemantics()`
/// (docs.flutter.dev/ui/accessibility/web-accessibility); it keeps the tree
/// on for as long as the returned handle lives.
///
/// The tree costs some frame time on the web, so the admin can turn it off
/// (`client.web_semantics_enabled`, on by default; admin → Config). The last
/// answer is kept on the device, so the next start already follows it
/// before the bootstrap arrives. Phones are untouched: their screen readers
/// turn semantics on by themselves.
abstract final class WebSemantics {
  /// The bootstrap `app_config` key (api: common/app-settings/client-tuning.ts).
  static const configKey = 'client.web_semantics_enabled';
  static const _prefsKey = 'web_semantics_enabled';

  static SemanticsHandle? _handle;
  static SharedPreferences? _prefs;

  /// Tests: act as the website.
  @visibleForTesting
  static bool forceWeb = false;

  static bool get _web => kIsWeb || forceWeb;

  /// Whether the semantics tree is held on now.
  static bool get isOn => _handle != null;

  /// At start, before `runApp`: the last known admin answer (on when none).
  static void start(SharedPreferences prefs) {
    if (!_web) return;
    _prefs = prefs;
    _set(on: prefs.getBool(_prefsKey) ?? true);
  }

  /// With the `app_config` of every bootstrap answer.
  static void apply(Map<String, String> config) {
    if (!_web) return;
    final on = config[configKey] != 'false';
    if (_prefs case final prefs?) unawaited(prefs.setBool(_prefsKey, on));
    _set(on: on);
  }

  static void _set({required bool on}) {
    if (on) {
      _handle ??= SemanticsBinding.instance.ensureSemantics();
    } else {
      _handle?.dispose();
      _handle = null;
    }
  }

  /// Back to the start state (tests).
  @visibleForTesting
  static void reset() {
    _handle?.dispose();
    _handle = null;
    _prefs = null;
    forceWeb = false;
  }
}
