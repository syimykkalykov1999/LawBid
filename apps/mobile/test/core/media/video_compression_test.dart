import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:v_video_compressor/v_video_compressor.dart';

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
    expect(videoQualityFor(1080), VVideoCompressQuality.high);
    expect(videoQualityFor(2160), VVideoCompressQuality.high);
    expect(videoQualityFor(720), VVideoCompressQuality.medium);
    // No 540p preset in the plugin: the next lower one, never higher.
    expect(videoQualityFor(540), VVideoCompressQuality.low);
  });

  // CMV 17.11 №5: the maintained fallback plugin gets the admin's numbers.
  test('the fallback plugin gets the admin bitrate, frame rate, H.264 + AAC',
      () {
    final c = pluginConfigFor((maxHeight: 720, frameRate: 24), 2000);
    expect(c.quality, VVideoCompressQuality.medium);
    expect(c.deleteOriginal, isFalse);
    expect(c.fallbackToOriginalIfNotSmaller, isTrue);
    expect(c.useHardwareAcceleration, isTrue);
    expect(c.useFastStart, isTrue);
    expect(c.includeMetadata, isFalse); // no location in the upload
    expect(c.advanced?.videoBitrate, 2000 * 1000);
    expect(c.advanced?.frameRate, 24);
    expect(c.advanced?.videoCodec, VVideoCodec.h264);
    expect(c.advanced?.audioCodec, VAudioCodec.aac);
    expect(c.isValid(), isTrue);
  });

  // Coordinator 17.11 (after #1223): the fallback must not drop below the
  // admin height. With the source size known, the plugin is asked for the
  // admin's exact short side (540 is not a plugin preset).
  test('fallback: admin 540 gives exactly 540 on the short side', () {
    final land = pluginConfigFor(
      (maxHeight: 540, frameRate: 30),
      1200,
      sourceWidth: 1920,
      sourceHeight: 1080,
    );
    expect(land.advanced?.customWidth, 960);
    expect(land.advanced?.customHeight, 540);
    expect(land.advanced?.dimensionHandling, VDimensionHandling.exact);
    expect(land.advanced?.videoBitrate, 1200 * 1000); // ladder kept
    expect(land.isValid(), isTrue);

    // Portrait 4:3 (a preset bounds the long side to 960 → short 720).
    final tall = pluginConfigFor(
      (maxHeight: 540, frameRate: 30),
      1200,
      sourceWidth: 1080,
      sourceHeight: 1440,
    );
    expect(tall.advanced?.customWidth, 540);
    expect(tall.advanced?.customHeight, 720);
  });

  test('fallback: any admin height, even sides, never above the source', () {
    expect(pluginOutputSizeFor(720, 1920, 1080), (width: 1280, height: 720));
    expect(pluginOutputSizeFor(1080, 1080, 1920), (width: 1080, height: 1920));
    // An odd admin value or aspect still gives even sides.
    expect(pluginOutputSizeFor(601, 1918, 1080), (width: 1066, height: 600));
    // Smaller than the admin height: keep the source size, no upscaling.
    expect(pluginOutputSizeFor(1080, 1280, 720), (width: 1280, height: 720));
    // Unknown size → null (the preset is used).
    expect(pluginOutputSizeFor(540, 0, 0), isNull);
    final c = pluginConfigFor((maxHeight: 540, frameRate: 30), 1200);
    expect(c.advanced?.customWidth, isNull);
    expect(c.quality, VVideoCompressQuality.low);
  });

  // Owner rows 101/102: the numbers that were built into the app are the
  // admin's now, with the old values as defaults.
  test('chat/case/support height: 720 by default, the admin value, 0 = off',
      () {
    expect(chatVideoLimitsOf(flags(const {})), (maxHeight: 720, frameRate: 30));
    expect(
      chatVideoLimitsOf(flags(const {'media.chat_video_max_height': '1080'})),
      (maxHeight: 1080, frameRate: 30),
    );
    // Never above the reel limit.
    expect(
      chatVideoLimitsOf(
        flags(const {
          'media.chat_video_max_height': '1080',
          'media.video_max_height': '720',
        }),
      ).maxHeight,
      720,
    );
    // Reels as recorded: chat still uses its own height (as before).
    expect(
      chatVideoLimitsOf(flags(const {'media.video_max_height': '0'})).maxHeight,
      720,
    );
    expect(
      chatVideoLimitsOf(flags(const {'media.chat_video_max_height': '0'}))
          .maxHeight,
      0,
    );
  });

  test('re-encode threshold: 8000 kbit/s by default, the admin value', () {
    expect(videoReencodeAboveKbpsOf(flags(const {})), 8000);
    expect(
      videoReencodeAboveKbpsOf(
        flags(const {'media.video_reencode_above_kbps': '5000'}),
      ),
      5000,
    );
    const limits = (maxHeight: 1080, frameRate: 30);
    // 1080p at 6 Mbit/s: kept at the default, re-encoded at 5000.
    bool need(int kbps) => needsVideoCompression(
          shortSide: 1080,
          bytes: 6000 * 1000 ~/ 8 * 30,
          durationMs: 30000,
          limits: limits,
          reencodeAboveKbps: kbps,
        );
    expect(need(8000), isFalse);
    expect(need(5000), isTrue);
  });

  test('row 199: one encode for Bunny — on by default, off = as before', () {
    expect(bunnyOneEncodeOf(flags(const {})), isTrue);
    expect(
      bunnyOneEncodeOf(flags(const {'media.bunny_one_encode': 'true'})),
      isTrue,
    );
    expect(
      bunnyOneEncodeOf(flags(const {'media.bunny_one_encode': 'false'})),
      isFalse,
    );
    expect(videoMaxBytesOf(flags(const {})), 1000 * 1024 * 1024);
    expect(
      videoMaxBytesOf(flags(const {'video.max_size_mb': '200'})),
      200 * 1024 * 1024,
    );
    const limits = (maxHeight: 1080, frameRate: 30);
    const maxBytes = 1000 * 1024 * 1024;
    // An Android 1080p recording, 17 Mbit/s, 60 s: before re-encoded on
    // the phone (then by Bunny again); now uploaded as recorded.
    bool need(int shortSide, int bytes, {required bool one}) =>
        needsVideoCompression(
          shortSide: shortSide,
          bytes: bytes,
          durationMs: 60000,
          limits: limits,
          oneEncode: one,
          maxBytes: maxBytes,
        );
    const android1080 = 17000 * 1000 ~/ 8 * 60;
    expect(need(1080, android1080, one: false), isTrue);
    expect(need(1080, android1080, one: true), isFalse);
    // 4K is still shrunk on the phone (upload size), and so is a file over
    // the server's limit.
    expect(need(2160, android1080, one: true), isTrue);
    expect(need(1080, maxBytes + 1, one: true), isTrue);
  });
}
