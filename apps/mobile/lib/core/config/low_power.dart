import 'dart:async';

import 'package:battery_plus/battery_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:lawbid/core/config/client_tuning.dart';

/// Below this charge, on battery, the phone counts as low on power.
const kLowPowerBatteryPercent = 20;

/// R-256 (flag `low_power_mode`): whether the app should go gently now: the
/// phone's own battery saver, or little charge left and not on a charger.
bool isLowPower({
  required int level,
  required bool charging,
  required bool saver,
}) =>
    saver || (!charging && level <= kLowPowerBatteryPercent);

/// Keeps [ClientTuning.lowPower] current: at the app's return to the screen
/// and when the charger is plugged in or out. Reads the battery only while
/// the flag is on; off, [ClientTuning.lowPower] stays false and no plugin
/// call is made.
class LowPowerMonitor with WidgetsBindingObserver {
  LowPowerMonitor._();

  static final instance = LowPowerMonitor._();

  bool _on = false;
  StreamSubscription<BatteryState>? _charger;

  /// Called with every bootstrap answer.
  void setEnabled({required bool enabled}) {
    if (enabled == _on) return;
    _on = enabled;
    if (enabled) {
      WidgetsBinding.instance.addObserver(this);
      try {
        _charger = Battery().onBatteryStateChanged.listen(
              (_) => unawaited(refresh()),
              onError: (Object _) {},
            );
      } on Object catch (e) {
        debugPrint('battery: $e');
      }
      unawaited(refresh());
    } else {
      WidgetsBinding.instance.removeObserver(this);
      unawaited(_charger?.cancel());
      _charger = null;
      ClientTuning.lowPower = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) unawaited(refresh());
  }

  /// Never throws: a phone that does not tell counts as not low.
  Future<void> refresh() async {
    if (!_on) return;
    try {
      final battery = Battery();
      final state = await battery.batteryState;
      final low = isLowPower(
        level: await battery.batteryLevel,
        charging: state == BatteryState.charging || state == BatteryState.full,
        saver: await battery.isInBatterySaveMode,
      );
      if (_on) ClientTuning.lowPower = low;
    } on Object catch (e) {
      debugPrint('battery: $e');
      ClientTuning.lowPower = false;
    }
  }
}
