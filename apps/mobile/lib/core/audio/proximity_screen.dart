import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:proximity_sensor/proximity_sensor.dart';

/// The two calls of the proximity_sensor plugin (MIT) this app uses.
abstract interface class ProximityBackend {
  /// Android: arms PROXIMITY_SCREEN_OFF_WAKE_LOCK; false also releases it.
  /// iOS: nothing (the screen follows `isProximityMonitoringEnabled`).
  Future<void> setScreenOff({required bool on});

  /// 1 = something is near, 0 = nothing. Listening is what turns the
  /// sensor on: Android registers it and, when armed, acquires the screen
  /// lock; iOS sets `UIDevice.isProximityMonitoringEnabled = true`.
  /// Cancelling turns both off.
  Stream<int> events();
}

class PluginProximityBackend implements ProximityBackend {
  const PluginProximityBackend();

  @override
  Future<void> setScreenOff({required bool on}) =>
      ProximitySensor.setProximityScreenOff(on);

  @override
  Stream<int> events() => ProximitySensor.events;
}

class _NoProximity implements ProximityBackend {
  const _NoProximity();

  @override
  Future<void> setScreenOff({required bool on}) async {}

  @override
  Stream<int> events() => const Stream<int>.empty();
}

/// Owner 2026-11-08 (Samsung): like WhatsApp and Telegram the screen goes
/// dark at the ear in an earpiece call and while a voice note plays.
///
/// The plugin acquires the Android screen-off wake lock only inside its
/// `onListen`, and only when `setProximityScreenOff(true)` came BEFORE the
/// listen (its README: "WAKE_LOCK permission is needed if you run
/// setProximityScreenOff(true) before listening to events"). A later
/// `setProximityScreenOff(true)` just sets a flag, and iOS has no such call
/// at all: there only a listener turns proximity monitoring on. The call
/// screen never listened and the voice note armed the flag after listening,
/// so neither ever darkened the screen.
///
/// Here one listener is shared by everyone who needs the screen off
/// (a call and a voice note both talk to the same native handler): the
/// first holder arms the lock and then listens, the last one cancels and
/// disarms. Operations run one after another in call order.
class ProximityScreen {
  ProximityScreen(this._backend);

  final ProximityBackend _backend;
  final _holders = <Object>{};
  final _near = StreamController<bool>.broadcast();
  StreamSubscription<int>? _sub;
  Future<void> _queue = Future<void>.value();

  /// True while something is near the sensor (only while held).
  Stream<bool> get near => _near.stream;

  /// The sensor listens and the screen-off lock is armed.
  bool get active => _sub != null;

  bool holds(Object holder) => _holders.contains(holder);

  /// [holder] wants the screen off at the ear. Idempotent.
  Future<void> hold(Object holder) {
    if (!_holders.add(holder)) return _queue;
    return _sync();
  }

  /// [holder] no longer needs it; the last release turns the sensor off.
  Future<void> release(Object holder) {
    if (!_holders.remove(holder)) return _queue;
    return _sync();
  }

  Future<void> _sync() => _queue = _queue.then((_) => _apply());

  Future<void> _apply() async {
    final want = _holders.isNotEmpty;
    if (want == active) return;
    if (want) {
      try {
        // Order matters on Android: arm first, then listen.
        await _backend.setScreenOff(on: true);
      } on Object catch (e) {
        if (kDebugMode) debugPrint('proximity screen-off unavailable: $e');
      }
      try {
        _sub = _backend.events().listen(
              (v) => _near.add(v > 0),
              // No sensor (the plugin throws in onListen): nothing to do.
              onError: (Object _) {},
            );
      } on Object catch (e) {
        if (kDebugMode) debugPrint('proximity sensor unavailable: $e');
      }
    } else {
      try {
        await _sub?.cancel();
      } on Object {
        // Already gone.
      }
      _sub = null;
      try {
        await _backend.setScreenOff(on: false);
      } on Object {
        // No plugin: nothing was held.
      }
      _near.add(false);
    }
  }
}

final proximityScreenProvider = Provider<ProximityScreen>(
  (ref) => ProximityScreen(
    kIsWeb ? const _NoProximity() : const PluginProximityBackend(),
  ),
);
