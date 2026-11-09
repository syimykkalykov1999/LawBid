import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';

/// Owner 2026-11-08 (one control for translation): the master
/// `chat_translate` and one bootstrap flag per zone that follows it.
FeatureFlagsState flags(Map<String, bool> f) =>
    FeatureFlagsState(flags: f, appConfig: const {});

const zones = [
  'translate_chat',
  'translate_posts',
  'translate_cases',
  'translate_reviews',
  'translate_profiles',
];

void main() {
  test('master off: no zone, whatever the zone flags say', () {
    final s = flags({
      'chat_translate': false,
      for (final z in zones) z: true,
    });
    for (final z in zones) {
      expect(s.translationOn(z), isFalse, reason: z);
    }
  });

  test('master on: each zone follows only its own flag', () {
    for (final off in zones) {
      final s = flags({
        'chat_translate': true,
        for (final z in zones) z: z != off,
      });
      for (final z in zones) {
        expect(s.translationOn(z), z != off, reason: '$off off, $z');
      }
    }
  });

  test('chats off no longer switch posts, cases, reviews, profiles off', () {
    final s = flags({
      'chat_translate': true,
      'translate_chat': false,
      'translate_posts': true,
      'translate_cases': true,
      'translate_reviews': true,
      'translate_profiles': true,
    });
    expect(s.translationOn('translate_chat'), isFalse);
    expect(s.translationOn('translate_posts'), isTrue);
    expect(s.translationOn('translate_profiles'), isTrue);
  });

  test('an older server (no translate_chat): the master decides chats', () {
    expect(
      flags({'chat_translate': true}).translationOn('translate_chat'),
      isTrue,
    );
    expect(
      flags({'chat_translate': false}).translationOn('translate_chat'),
      isFalse,
    );
  });

  test('nothing from the bootstrap yet: off everywhere', () {
    for (final z in zones) {
      expect(flags(const {}).translationOn(z), isFalse, reason: z);
    }
  });

  test('other flags are not touched', () {
    final s = flags({'chat_translate': true, 'stories': true});
    expect(s.isEnabled('stories'), isTrue);
    expect(s.isEnabled('chat_translate'), isTrue);
  });
}
