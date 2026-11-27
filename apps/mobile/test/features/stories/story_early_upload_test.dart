import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/diagnostics/perf_marks.dart';
import 'package:lawbid/features/stories/application/story_publish_job.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';

import '../social/social_fakes.dart';
import 'stories_fakes.dart';
import 'stories_harness.dart';

/// Owner 26.11 (Instagram «upload while you edit»): the picked photo or
/// video goes up while the story is still being edited, without showing
/// anything in the tray; «Share» then only waits for what is left.
class _CountingSocial extends FakeSocialRepository {
  int photoUploads = 0;
  Completer<String>? gate;

  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
    String? path,
  }) async {
    photoUploads++;
    final g = gate;
    if (g != null) return g.future;
    return 'early-photo';
  }
}

Future<ProviderContainer> _container(
  FakeStoriesRepository repo, {
  _CountingSocial? social,
}) async {
  final c = ProviderContainer(
    overrides: await storyOverrides(repo: repo, social: social),
  );
  addTearDown(c.dispose);
  return c;
}

StoryDraft _video(XFile file, {int trim = 0}) => StoryDraft(
      kind: StoryKind.video,
      audience: StoryAudience.all,
      video: file,
      videoDurationMs: 20000,
      trimStartMs: trim,
    );

void main() {
  setUp(PerfMarks.takePublishTaps);

  testWidgets('a picked photo uploads at once; Share does not upload again',
      (tester) async {
    final repo = FakeStoriesRepository();
    final social = _CountingSocial();
    final c = await _container(repo, social: social);
    final job = c.read(storyPublishJobProvider.notifier);
    final photo = Uint8List.fromList([1, 2, 3]);

    job.preparePhoto(photo, name: 'p.jpg');
    await tester.pump();
    expect(social.photoUploads, 1, reason: 'started at the pick');
    expect(
      c.read(storyPublishJobProvider).phase,
      StoryPublishPhase.idle,
      reason: 'nothing shows in the tray before Share',
    );

    await job.start(
      StoryDraft(
        kind: StoryKind.photo,
        audience: StoryAudience.all,
        photo: photo,
        photoName: 'p.jpg',
      ),
    );
    expect(social.photoUploads, 1, reason: 'Share reused the early upload');
    expect(job.lastShareHadMedia, isTrue);
    expect(repo.created.single['fileId'], 'early-photo');
    expect(c.read(storyPublishJobProvider).phase, StoryPublishPhase.done);
    expect(
      PerfMarks.takePublishTaps(),
      [(surface: 'story', mediaReady: true)],
    );
  });

  testWidgets('Share while the photo still uploads waits for that upload',
      (tester) async {
    final repo = FakeStoriesRepository();
    final social = _CountingSocial()..gate = Completer<String>();
    final c = await _container(repo, social: social);
    final job = c.read(storyPublishJobProvider.notifier);
    final photo = Uint8List.fromList([4, 5]);

    job.preparePhoto(photo);
    final run = job.start(
      StoryDraft(
        kind: StoryKind.photo,
        audience: StoryAudience.all,
        photo: photo,
      ),
    );
    await tester.pump();
    expect(job.lastShareHadMedia, isFalse);
    expect(
      c.read(storyPublishJobProvider).phase,
      StoryPublishPhase.uploading,
    );
    expect(repo.created, isEmpty);
    social.gate!.complete('late-photo');
    await run;
    expect(social.photoUploads, 1);
    expect(repo.created.single['fileId'], 'late-photo');
  });

  testWidgets('a picked video uploads while editing; Share only posts it',
      (tester) async {
    final repo = FakeStoriesRepository();
    final c = await _container(repo);
    final job = c.read(storyPublishJobProvider.notifier);
    final file = XFile.fromData(Uint8List(32), name: 'v.mp4');

    job.prepareVideo(file, durationMs: 20000);
    await tester.pump();
    expect(repo.uploads, 1, reason: 'went to Bunny at the pick');
    expect(c.read(storyPublishJobProvider).phase, StoryPublishPhase.idle);

    final run = job.start(_video(file));
    await tester.pump(const Duration(seconds: 3));
    await run;
    expect(repo.uploads, 1, reason: 'not uploaded twice');
    expect(job.lastShareHadMedia, isTrue);
    expect(repo.created.single['videoAssetId'], 'asset-1');
    expect(repo.cancelledVideos, isEmpty);
  });

  testWidgets('a trim moved after the early upload makes a new slot',
      (tester) async {
    final repo = FakeStoriesRepository();
    final c = await _container(repo);
    final job = c.read(storyPublishJobProvider.notifier);
    final file = XFile.fromData(Uint8List(32), name: 'v.mp4');

    job.prepareVideo(file, durationMs: 20000);
    await tester.pump();
    final run = job.start(_video(file, trim: 3000));
    await tester.pump(const Duration(seconds: 3));
    await run;
    expect(repo.uploadTrims, [0, 3000]);
    expect(repo.cancelledVideos, ['asset-1'], reason: 'the old slot goes');
    expect(c.read(storyPublishJobProvider).phase, StoryPublishPhase.done);
  });

  testWidgets('a dropped pick deletes its early upload', (tester) async {
    final repo = FakeStoriesRepository();
    final c = await _container(repo);
    final job = c.read(storyPublishJobProvider.notifier)
      ..prepareVideo(
        XFile.fromData(Uint8List(8), name: 'v.mp4'),
        durationMs: 5000,
      );
    await tester.pump();
    job.discardPrepared();
    await tester.pump();
    expect(repo.cancelledVideos, ['asset-1']);
    expect(repo.created, isEmpty);
    expect(c.read(storyPublishJobProvider).phase, StoryPublishPhase.idle);
  });
}
