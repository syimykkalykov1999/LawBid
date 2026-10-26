import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:record/record.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Which explanation is on screen.
enum PrimerStep { notifications, microphone }

/// Whether the microphone is already allowed — asked without showing the
/// system dialog. True where the platform cannot tell (web, tests).
final microphoneGrantedProvider = Provider<Future<bool> Function()>(
  (ref) => () async {
    if (kIsWeb) return true;
    try {
      final recorder = AudioRecorder();
      try {
        return await recorder.hasPermission(request: false);
      } finally {
        await recorder.dispose();
      }
    } on Object {
      return true;
    }
  },
);

/// Owner 2026-10-22 (audit #13, Apple HIG «Requesting permission»): the
/// phone's permission dialogs come after a short explanation of why, never
/// cold right after sign-in. A «no» in the system dialog is for good, so the
/// app explains first and lets the person say «Not now» instead.
///
/// - Notifications (calls, messages): after sign-in, once; «Not now» comes
///   back after [laterPause].
/// - Microphone: on iOS right after the notifications step (a call answered
///   on the CallKit sheet must already have it — PR #236); on Android at the
///   first call (outgoing or answered), see [explainMicrophone].
///
/// The explanation itself is drawn by `PermissionPrimerHost` (app.dart);
/// without a host on screen (tests, background) the system is asked
/// directly, as before.
class PermissionPrimer extends Notifier<PrimerStep?> {
  static const _key = 'permissions.primer.v1';
  static const _micKey = 'permissions.primer.mic.v1';
  static const laterPause = Duration(days: 3);

  Completer<bool>? _answer;
  var _hosts = 0;

  @visibleForTesting
  static DateTime Function() now = DateTime.now;

  @override
  PrimerStep? build() => null;

  SharedPreferences get _prefs => ref.read(sharedPreferencesProvider);

  /// The host on screen registers itself; no host → no explanation.
  void attach() => _hosts++;
  void detach() {
    _hosts--;
    if (_hosts <= 0) answer(yes: true);
  }

  /// The host's buttons: «Continue» (yes) or «Not now».
  void answer({required bool yes}) {
    final c = _answer;
    _answer = null;
    if (ref.mounted && state != null) state = null;
    if (c != null && !c.isCompleted) c.complete(yes);
  }

  Future<bool> _show(PrimerStep step) {
    if (_hosts <= 0) return Future.value(true);
    final previous = _answer;
    if (previous != null && !previous.isCompleted) previous.complete(false);
    final c = Completer<bool>();
    _answer = c;
    state = step;
    return c.future;
  }

  /// After sign-in (push_service.dart): explains notifications, then runs
  /// [notifications] (the system dialogs); with [microphone] (iOS) explains
  /// and asks the microphone next. Already explained and accepted → the
  /// system calls run directly (they are silent once decided).
  Future<void> onboard({
    required Future<void> Function() notifications,
    Future<void> Function()? microphone,
  }) async {
    final saved = _prefs.getString(_key);
    if (saved == 'yes') {
      await notifications();
      if (microphone != null) await microphone();
      return;
    }
    if (saved != null && saved.startsWith('later:')) {
      final at = int.tryParse(saved.substring(6)) ?? 0;
      final since = now().difference(DateTime.fromMillisecondsSinceEpoch(at));
      if (since < laterPause) return;
    }
    final yes = await _show(PrimerStep.notifications);
    await _prefs.setString(
      _key,
      yes ? 'yes' : 'later:${now().millisecondsSinceEpoch}',
    );
    if (yes) await notifications();
    if (microphone != null && !await ref.read(microphoneGrantedProvider)()) {
      if (await _show(PrimerStep.microphone)) {
        await _prefs.setBool(_micKey, true);
        await microphone();
      }
    }
  }

  /// Before the first call's microphone dialog (Android): true = go on and
  /// ask the system, false = «Not now» (the call does not start). Once the
  /// person said «Continue», later calls go straight to the system.
  Future<bool> explainMicrophone() async {
    if (await ref.read(microphoneGrantedProvider)()) return true;
    if (_prefs.getBool(_micKey) ?? false) return true;
    final yes = await _show(PrimerStep.microphone);
    if (yes) await _prefs.setBool(_micKey, true);
    return yes;
  }
}

final permissionPrimerProvider =
    NotifierProvider<PermissionPrimer, PrimerStep?>(PermissionPrimer.new);
