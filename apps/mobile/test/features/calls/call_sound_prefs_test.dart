import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/calls/application/call_sound_prefs.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Owner 2026-10-22 (R-007): the «video on» call sound switch is on by
/// default and is kept on the phone.
Future<ProviderContainer> _open(Map<String, Object> stored) async {
  SharedPreferences.setMockInitialValues(stored);
  final prefs = await SharedPreferences.getInstance();
  final c = ProviderContainer(
    overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  test('on by default', () async {
    final c = await _open({});
    expect(c.read(callVideoSoundProvider), isTrue);
  });

  test('off is kept and read back after a restart', () async {
    final c = await _open({});
    await c.read(callVideoSoundProvider.notifier).set(on: false);
    expect(c.read(callVideoSoundProvider), isFalse);
    final prefs = await SharedPreferences.getInstance();
    final again = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(prefs)],
    );
    addTearDown(again.dispose);
    expect(again.read(callVideoSoundProvider), isFalse);
    await again.read(callVideoSoundProvider.notifier).set(on: true);
    expect(again.read(callVideoSoundProvider), isTrue);
  });

  test('no storage at all: still on, no crash', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    expect(c.read(callVideoSoundProvider), isTrue);
  });
}
