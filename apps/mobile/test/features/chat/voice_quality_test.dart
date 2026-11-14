import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';

/// Owner rows 101/102: the voice note's AAC numbers are the admin's, with
/// the old built-in 32 kbit/s, 16 kHz as defaults.
void main() {
  FeatureFlagsState flags(Map<String, String> c) =>
      FeatureFlagsState(flags: const {}, appConfig: c);

  test('32 kbit/s at 16 kHz by default', () {
    expect(
      voiceQualityOf(flags(const {})),
      (bitRate: 32000, sampleRate: 16000),
    );
  });

  test('the admin values; a bitrate is bounded, an odd rate is refused', () {
    expect(
      voiceQualityOf(
        flags(const {
          'media.voice_bitrate_kbps': '48',
          'media.voice_sample_rate_hz': '24000',
        }),
      ),
      (bitRate: 48000, sampleRate: 24000),
    );
    expect(
      voiceQualityOf(
        flags(const {
          'media.voice_bitrate_kbps': '4',
          'media.voice_sample_rate_hz': '12345',
        }),
      ),
      (bitRate: 16000, sampleRate: 16000),
    );
  });
}
