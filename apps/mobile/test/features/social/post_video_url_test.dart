import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-15 (web): a browser plays the MP4 copy of a video when
/// there is one (Chrome has no HLS of its own); a phone takes HLS, except
/// for a short clip (owner 2026-11-01: HLS needs three round trips before
/// the first frame, the MP4 one).
void main() {
  const both = PostVideo(
    status: 'ready',
    playbackUrl: 'https://cdn/x/playlist.m3u8',
    fallbackUrl: 'https://cdn/x/play_720p.mp4',
  );
  const hlsOnly = PostVideo(
    status: 'ready',
    playbackUrl: 'https://cdn/x/playlist.m3u8',
  );

  const short = PostVideo(
    status: 'ready',
    playbackUrl: 'https://cdn/x/playlist.m3u8',
    fallbackUrl: 'https://cdn/x/play_720p.mp4',
    durationSec: 5,
  );

  test('the phone takes the HLS playlist of a long or unknown-length video',
      () {
    expect(both.playerUrl(web: false), 'https://cdn/x/playlist.m3u8');
    expect(both.usesMp4(web: false), isFalse);
  });

  test('the browser takes the MP4 when there is one', () {
    expect(both.playerUrl(web: true), 'https://cdn/x/play_720p.mp4');
    expect(both.usesMp4(web: true), isTrue);
  });

  test('the browser falls back to HLS when there is no MP4', () {
    expect(hlsOnly.playerUrl(web: true), 'https://cdn/x/playlist.m3u8');
    expect(hlsOnly.usesMp4(web: true), isFalse);
  });

  test('a short clip uses the MP4 on a phone too, a long one does not', () {
    expect(short.playerUrl(web: false), 'https://cdn/x/play_720p.mp4');
    expect(short.usesMp4(web: false), isTrue);
    const long = PostVideo(
      status: 'ready',
      playbackUrl: 'https://cdn/x/playlist.m3u8',
      fallbackUrl: 'https://cdn/x/play_720p.mp4',
      durationSec: 31,
    );
    expect(long.playerUrl(web: false), 'https://cdn/x/playlist.m3u8');
  });

  test('after the MP4 failed the player retries with HLS', () {
    expect(
      short.playerUrl(web: false, hlsOnly: true),
      'https://cdn/x/playlist.m3u8',
    );
    expect(short.usesMp4(web: false, hlsOnly: true), isFalse);
  });

  test('a short clip without an MP4 copy stays on HLS', () {
    const noCopy = PostVideo(
      status: 'ready',
      playbackUrl: 'https://cdn/x/playlist.m3u8',
      durationSec: 5,
    );
    expect(noCopy.usesMp4(web: false), isFalse);
  });

  test('the stream warmed ahead is the one the player will open', () {
    expect(both.warmUrl(web: true), 'https://cdn/x/play_720p.mp4');
    expect(both.warmUrl(web: false), 'https://cdn/x/playlist.m3u8');
    expect(hlsOnly.warmUrl(web: true), 'https://cdn/x/playlist.m3u8');
    const processing = PostVideo(status: 'processing');
    expect(processing.warmUrl(web: true), isNull);
    expect(processing.warmUrl(web: false), isNull);
  });
}
