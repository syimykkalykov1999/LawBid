import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:video_compress/video_compress.dart';

/// Owner 2026-10-05: reels are re-encoded on the phone up to Full HD; the
/// admin sets the height and frame rate.
void main() {
  FeatureFlagsState flags(Map<String, String> config) =>
      FeatureFlagsState(flags: const {}, appConfig: config);

  test('defaults to 1080 / 30 fps; admin values are kept within bounds', () {
    expect(videoLimitsOf(flags(const {})), (maxHeight: 1080, frameRate: 30));
    expect(
      videoLimitsOf(
        flags(const {
          'media.video_max_height': '720',
          'media.video_frame_rate': '24',
        }),
      ),
      (maxHeight: 720, frameRate: 24),
    );
    expect(
      videoLimitsOf(
        flags(const {
          'media.video_max_height': '100',
          'media.video_frame_rate': '240',
        }),
      ),
      (maxHeight: 540, frameRate: 60),
    );
    expect(
      videoLimitsOf(flags(const {'media.video_max_height': '0'})).maxHeight,
      0,
    );
  });

  test('re-encodes 4K or heavy videos, keeps light Full HD as is', () {
    const limits = (maxHeight: 1080, frameRate: 30);
    // 4K, any size.
    expect(
      needsVideoCompression(
        shortSide: 2160,
        bytes: 1000,
        durationMs: 10000,
        limits: limits,
      ),
      isTrue,
    );
    // 1080p at ~16 Mbit/s (a phone recording).
    expect(
      needsVideoCompression(
        shortSide: 1080,
        bytes: 60 * 1000 * 1000,
        durationMs: 30000,
        limits: limits,
      ),
      isTrue,
    );
    // 1080p at ~4 Mbit/s: already small.
    expect(
      needsVideoCompression(
        shortSide: 1080,
        bytes: 15 * 1000 * 1000,
        durationMs: 30000,
        limits: limits,
      ),
      isFalse,
    );
    // Switched off by the admin.
    expect(
      needsVideoCompression(
        shortSide: 2160,
        bytes: 1,
        durationMs: 1,
        limits: (maxHeight: 0, frameRate: 30),
      ),
      isFalse,
    );
  });

  test('the plugin preset follows the target height', () {
    expect(videoQualityFor(1080), VideoQuality.Res1920x1080Quality);
    expect(videoQualityFor(2160), VideoQuality.Res1920x1080Quality);
    expect(videoQualityFor(720), VideoQuality.Res1280x720Quality);
    expect(videoQualityFor(540), VideoQuality.Res960x540Quality);
  });
}
