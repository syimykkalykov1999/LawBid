import 'dart:async';

import 'package:lawbid/core/audio/proximity_screen.dart';

/// Records the plugin calls in order, like the native handler sees them:
/// `arm` / `disarm` = setProximityScreenOff(true/false), `listen` /
/// `cancel` = the event stream's onListen / onCancel.
class FakeProximityBackend implements ProximityBackend {
  final calls = <String>[];
  bool armed = false;
  StreamController<int>? _events;

  /// What the Android plugin does: the screen-off lock is taken only in
  /// onListen, and only when armed before it.
  bool lockHeld = false;

  bool get listening => _events != null;

  void near({required bool value}) => _events?.add(value ? 1 : 0);

  @override
  Future<void> setScreenOff({required bool on}) async {
    calls.add(on ? 'arm' : 'disarm');
    armed = on;
    if (!on) lockHeld = false;
  }

  @override
  Stream<int> events() {
    late final StreamController<int> c;
    c = StreamController<int>(
      onListen: () {
        calls.add('listen');
        _events = c;
        if (armed) lockHeld = true;
      },
      onCancel: () {
        calls.add('cancel');
        _events = null;
        lockHeld = false;
      },
    );
    return c.stream;
  }
}
