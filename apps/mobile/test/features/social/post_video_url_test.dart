import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-15 (web): a browser plays the MP4 copy of a video when
/// there is one (Chrome has no HLS of its own); phones always take HLS.
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

  test('the phone takes the HLS playlist', () {
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
}
