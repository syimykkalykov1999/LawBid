import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/stories/application/story_playback.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';

import 'stories_fakes.dart';

void main() {
  group('StoryPlayback', () {
    late List<String> shown;
    late int finished;
    late int before;

    StoryPlayback make({int start = 0, List<Story>? stories}) {
      shown = [];
      finished = 0;
      before = 0;
      return StoryPlayback(
        stories: stories ?? [fakeStory('a'), fakeStory('b'), fakeStory('c')],
        startIndex: start,
        onShown: (s) => shown.add(s.id),
        onFinished: () => finished++,
        onBeforeFirst: () => before++,
      );
    }

    test('a still story lasts 5 s, then the next one plays in order', () {
      final pb = make();
      expect(shown, ['a']);
      pb.advance(const Duration(milliseconds: 2500));
      expect(pb.progress, closeTo(0.5, 0.001));
      expect(pb.barValue(0), closeTo(0.5, 0.001));
      expect(pb.barValue(1), 0);
      pb.advance(const Duration(milliseconds: 2500));
      expect(pb.index, 1);
      expect(pb.progress, 0);
      expect(pb.barValue(0), 1);
      expect(shown, ['a', 'b']);
      pb
        ..advance(const Duration(seconds: 5))
        ..advance(const Duration(seconds: 5));
      expect(shown, ['a', 'b', 'c']);
      expect(finished, 1);
    });

    test('a hold stops the clock until it is released', () {
      final pb = make()
        ..hold('touch')
        ..advance(const Duration(seconds: 3));
      expect(pb.progress, 0);
      expect(pb.paused, isTrue);
      pb
        ..hold('sheet')
        ..release('touch');
      expect(pb.paused, isTrue, reason: 'the sheet still holds it');
      pb
        ..release('sheet')
        ..advance(const Duration(seconds: 1));
      expect(pb.progress, closeTo(0.2, 0.001));
    });

    test('next / previous move by one; previous on the first restarts it', () {
      final pb = make(start: 1);
      expect(shown, ['b']);
      pb.next();
      expect(pb.index, 2);
      pb.previous();
      expect(pb.index, 1);
      pb.previous();
      expect(pb.index, 0);
      pb
        ..advance(const Duration(seconds: 2))
        ..previous();
      expect(pb.progress, 0);
      expect(pb.restarts, 1);
      expect(before, 0);
      pb.previous();
      expect(before, 1);
    });

    test('next on the last story finishes', () {
      final pb = make(start: 2)..next();
      expect(finished, 1);
      expect(pb.progress, 1);
    });

    test('a video runs on its player: the timer is ignored', () {
      final video = Story(
        id: 'v',
        author: anna,
        kind: StoryKind.video,
        video: const StoryVideo(
          ready: true,
          playbackUrl: 'https://cdn.test/v.m3u8',
          durationSec: 12,
        ),
        overlays: const [],
        audience: StoryAudience.all,
        createdAt: DateTime(2026),
        expiresAt: DateTime(2027),
        viewedByMe: false,
        isMine: false,
        viewCount: 0,
        canReply: true,
      );
      expect(video.playLength, const Duration(seconds: 12));
      final pb = make(stories: [video, fakeStory('t')]);
      expect(pb.timed, isFalse);
      pb.advance(const Duration(seconds: 20));
      expect(pb.index, 0);
      pb.reportVideo(0.4);
      expect(pb.progress, closeTo(0.4, 0.001));
      pb.completeCurrent();
      expect(pb.index, 1);
    });

    test('a video that cannot play runs as a still', () {
      final video = Story(
        id: 'v',
        author: anna,
        kind: StoryKind.video,
        video: const StoryVideo(ready: true, playbackUrl: 'x', durationSec: 9),
        overlays: const [],
        audience: StoryAudience.all,
        createdAt: DateTime(2026),
        expiresAt: DateTime(2027),
        viewedByMe: false,
        isMine: false,
        viewCount: 0,
        canReply: true,
      );
      final pb = make(stories: [video, fakeStory('t')])..videoFailed();
      expect(pb.timed, isTrue);
      pb.advance(const Duration(seconds: 9));
      expect(pb.index, 1);
    });

    test('a video longer than the cap is cut to it', () {
      const v = StoryVideo(
        ready: true,
        playbackUrl: 'x',
        durationSec: 60,
        trimStartMs: 10000,
        trimEndMs: 25000,
      );
      expect(v.playLength, const Duration(seconds: 15));
      const long = StoryVideo(ready: true, durationSec: 120);
      expect(long.playLength, const Duration(seconds: 16));
    });
  });
}
