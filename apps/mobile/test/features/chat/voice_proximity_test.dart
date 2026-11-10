import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/audio/proximity_screen.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';

import '../../core/audio/fake_proximity.dart';

/// Owner 2026-11-08 (Samsung): while a voice note plays the screen goes
/// dark at the ear (WhatsApp). Playback itself (just_audio) is not run
/// here: the note's start calls the same watch the test calls.
class _NoCall extends CallController {
  @override
  CallSession build() => const CallSession();
}

ProviderContainer _container(FakeProximityBackend b) => ProviderContainer(
      overrides: [
        callControllerProvider.overrideWith(_NoCall.new),
        proximityScreenProvider.overrideWithValue(ProximityScreen(b)),
      ],
    );

void main() {
  test('a playing note holds the screen-off lock; stop lets it go', () async {
    final b = FakeProximityBackend();
    final c = _container(b);
    addTearDown(c.dispose);
    final player = c.read(voicePlayerProvider.notifier)
      ..debugWatchProximity()
      // Watching twice changes nothing.
      ..debugWatchProximity();
    await Future<void>.delayed(Duration.zero);
    expect(b.calls, ['arm', 'listen']);
    expect(b.lockHeld, isTrue);

    // Near while nothing plays: the sound is not switched to the earpiece.
    b.near(value: true);
    await Future<void>.delayed(Duration.zero);
    expect(player.debugEarpiece, isFalse);

    await player.stop();
    await Future<void>.delayed(Duration.zero);
    expect(b.lockHeld, isFalse);
    expect(b.listening, isFalse);
    expect(b.armed, isFalse);
  });

  test('the player going away lets the lock go', () async {
    final b = FakeProximityBackend();
    final c = _container(b);
    c.read(voicePlayerProvider.notifier).debugWatchProximity();
    await Future<void>.delayed(Duration.zero);
    expect(b.lockHeld, isTrue);
    c.dispose();
    await Future<void>.delayed(Duration.zero);
    expect(b.lockHeld, isFalse);
  });
}
