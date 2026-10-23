import 'package:flutter/widgets.dart';
import 'package:lawbid/core/config/client_tuning.dart';

/// Owner 2026-10-22 (client economy plan, package D): the payment screens
/// re-read the server when the app comes back to the front — needed after
/// an external payment page, but it also fired on every short switch to
/// another app. Now a resume refreshes only after at least [minAway] in
/// the background, or when this screen itself sent the user to an outside
/// page ([expectExternalReturn]).
mixin ResumeRefreshGate on WidgetsBindingObserver {
  DateTime? _awayAt;
  bool _external = false;

  static Duration get minAway => ClientTuning.resumeMinAway;

  /// The screen is about to open a payment / onboarding page outside the
  /// app: the next resume refreshes whatever the time away.
  void expectExternalReturn() => _external = true;

  /// Call from `didChangeAppLifecycleState`: true on the resume that
  /// deserves a refresh.
  bool resumeNeedsRefresh(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        _awayAt ??= DateTime.now();
        return false;
      case AppLifecycleState.resumed:
        final away = _awayAt;
        _awayAt = null;
        if (_external) {
          _external = false;
          return true;
        }
        return away != null && DateTime.now().difference(away) >= minAway;
      case AppLifecycleState.inactive:
      case AppLifecycleState.detached:
        return false;
    }
  }
}
