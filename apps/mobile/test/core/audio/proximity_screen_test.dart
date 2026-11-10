import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/audio/proximity_screen.dart';

import 'fake_proximity.dart';

/// Owner 2026-11-08 (Samsung): the screen stayed on at the ear. The
/// plugin takes the Android screen-off lock only when it is armed BEFORE
/// the sensor is listened to; iOS turns the screen off only while
/// something listens.
void main() {
  test('first holder arms the lock, then listens; last one lets go', () async {
    final b = FakeProximityBackend();
    final s = ProximityScreen(b);
    await s.hold('call');
    expect(b.calls, ['arm', 'listen']);
    expect(b.lockHeld, isTrue);
    expect(s.active, isTrue);

    await s.release('call');
    expect(b.calls, ['arm', 'listen', 'cancel', 'disarm']);
    expect(b.lockHeld, isFalse);
    expect(b.armed, isFalse);
    expect(s.active, isFalse);
  });

  test('a call and a voice note share one listener', () async {
    final b = FakeProximityBackend();
    final s = ProximityScreen(b);
    await s.hold('call');
    await s.hold('note');
    await s.hold('note');
    expect(b.calls, ['arm', 'listen']);
    // The note stops: the call keeps the screen dark at the ear.
    await s.release('note');
    expect(b.lockHeld, isTrue);
    expect(b.calls, ['arm', 'listen']);
    await s.release('call');
    expect(b.lockHeld, isFalse);
    // Releasing again changes nothing.
    await s.release('call');
    expect(b.calls, ['arm', 'listen', 'cancel', 'disarm']);
  });

  test('hold then release at once ends released, in order', () async {
    final b = FakeProximityBackend();
    final s = ProximityScreen(b);
    final a = s.hold('call');
    final r = s.release('call');
    await Future.wait([a, r]);
    // Nothing was applied twice and nothing is left held.
    expect(b.lockHeld, isFalse);
    expect(s.active, isFalse);

    await s.hold('call');
    await s.hold('call');
    expect(b.lockHeld, isTrue);
  });

  test('near events reach the holders while held', () async {
    final b = FakeProximityBackend();
    final s = ProximityScreen(b);
    final seen = <bool>[];
    final sub = s.near.listen(seen.add);
    await s.hold('note');
    b
      ..near(value: true)
      ..near(value: false);
    await Future<void>.delayed(Duration.zero);
    expect(seen, [true, false]);
    await s.release('note');
    await Future<void>.delayed(Duration.zero);
    // Let go: the holders hear "not near".
    expect(seen.last, isFalse);
    await sub.cancel();
  });
}
