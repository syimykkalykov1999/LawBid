import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/application/story_publish_job.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';

import 'stories_fakes.dart';
import 'stories_harness.dart';

Future<ProviderContainer> _container(
  FakeStoriesRepository repo, {
  bool enabled = true,
}) async {
  final c = ProviderContainer(
    overrides: await storyOverrides(repo: repo, enabled: enabled),
  );
  addTearDown(c.dispose);
  return c;
}

void main() {
  group('tray', () {
    test('is empty and asks nothing while the flag is off', () async {
      final repo = FakeStoriesRepository(trayItems: [trayItem(anna)]);
      final c = await _container(repo, enabled: false);
      expect(await c.read(storyTrayProvider.future), isEmpty);
      expect(repo.trayCalls, 0);
    });

    test('loads the server tray when on', () async {
      final repo = FakeStoriesRepository(
        trayItems: [trayItem(meUser, isMe: true), trayItem(anna)],
      );
      final c = await _container(repo);
      final items = await c.read(storyTrayProvider.future);
      expect(items.map((e) => e.user.id), ['me', 'u1']);
      expect(items.first.isMe, isTrue);
    });
  });

  group('settings', () {
    test('audience and replies are saved through the repository', () async {
      final repo = FakeStoriesRepository()..hiddenUsers.add(bob);
      final c = await _container(repo);
      final sub = c.listen(storySettingsProvider, (_, __) {});
      addTearDown(sub.close);
      final first = await c.read(storySettingsProvider.future);
      expect(first.audience, StoryAudience.followers);
      expect(first.hiddenCount, 1);

      final notifier = c.read(storySettingsProvider.notifier);
      await notifier.setAudience(StoryAudience.contacts);
      await notifier.setAllowReplies(value: false);
      final now = c.read(storySettingsProvider).requireValue;
      expect(now.audience, StoryAudience.contacts);
      expect(now.allowReplies, isFalse);
    });

    test('unhiding drops the person from the list and the count', () async {
      final repo = FakeStoriesRepository()..hiddenUsers.addAll([anna, bob]);
      final c = await _container(repo);
      final sub1 = c.listen(hiddenStoriesProvider, (_, __) {});
      final sub2 = c.listen(storySettingsProvider, (_, __) {});
      addTearDown(sub1.close);
      addTearDown(sub2.close);
      expect((await c.read(hiddenStoriesProvider.future)).length, 2);
      await c.read(storySettingsProvider.future);

      await c.read(hiddenStoriesProvider.notifier).unhide(anna);
      expect(repo.unhidden, ['u1']);
      expect(
        c.read(hiddenStoriesProvider).requireValue.map((u) => u.id),
        ['u2'],
      );
      await Future<void>.delayed(Duration.zero);
      expect(c.read(storySettingsProvider).requireValue.hiddenCount, 1);
    });
  });

  group('publish job', () {
    testWidgets('a text story is posted with its background and audience',
        (tester) async {
      final repo = FakeStoriesRepository();
      final c = await _container(repo);
      final phases = <StoryPublishPhase>[];
      c.listen(
        storyPublishJobProvider,
        (_, next) => phases.add(next.phase),
      );
      await c.read(storyPublishJobProvider.notifier).start(
            const StoryDraft(
              kind: StoryKind.text,
              audience: StoryAudience.contacts,
              text: 'Court is open',
              background: 'navy',
              overlays: [StoryOverlay(emoji: '⚖️', x: 0.5, y: 0.5)],
            ),
          );
      expect(phases.last, StoryPublishPhase.done);
      expect(repo.created.single, {
        'kind': StoryKind.text,
        'audience': StoryAudience.contacts,
        'fileId': null,
        'videoAssetId': null,
        'text': 'Court is open',
        'background': 'navy',
        'overlays': 1,
      });
    });

    testWidgets('a photo is uploaded first, then posted with the file id',
        (tester) async {
      final repo = FakeStoriesRepository();
      final c = await _container(repo);
      await c.read(storyPublishJobProvider.notifier).start(
            StoryDraft(
              kind: StoryKind.photo,
              audience: StoryAudience.all,
              photo: Uint8List.fromList([1, 2, 3]),
              photoName: 'p.jpg',
              text: 'Caption',
            ),
          );
      expect(c.read(storyPublishJobProvider).phase, StoryPublishPhase.done);
      expect(repo.created.single['fileId'], 'file-1');
      expect(repo.created.single['text'], 'Caption');
      expect(repo.created.single['background'], isNull);
    });

    testWidgets('a video waits until it is ready, then is posted',
        (tester) async {
      final repo = FakeStoriesRepository();
      final c = await _container(repo);
      final phases = <StoryPublishPhase>[];
      c.listen(
        storyPublishJobProvider,
        (_, next) => phases.add(next.phase),
      );
      final run = c.read(storyPublishJobProvider.notifier).start(
            StoryDraft(
              kind: StoryKind.video,
              audience: StoryAudience.followers,
              video: XFile.fromData(Uint8List(32), name: 'v.mp4'),
              videoDurationMs: 20000,
              trimStartMs: 2000,
            ),
          );
      unawaited(run);
      await tester.pump(const Duration(seconds: 3));
      await run;
      expect(repo.uploads, 1);
      expect(repo.statusCalls, 2);
      expect(
        phases,
        containsAllInOrder([
          StoryPublishPhase.compressing,
          StoryPublishPhase.uploading,
          StoryPublishPhase.processing,
          StoryPublishPhase.posting,
          StoryPublishPhase.done,
        ]),
      );
      expect(repo.created.single['videoAssetId'], 'asset-1');
    });

    testWidgets('a failure keeps the draft: retry posts it', (tester) async {
      final repo = FakeStoriesRepository()
        ..failCreate = const ApiException(
          code: ApiException.networkErrorCode,
          message: 'offline',
        );
      final c = await _container(repo);
      final job = c.read(storyPublishJobProvider.notifier);
      await job.start(
        const StoryDraft(
          kind: StoryKind.text,
          audience: StoryAudience.all,
          text: 'Hi',
        ),
      );
      final failed = c.read(storyPublishJobProvider);
      expect(failed.phase, StoryPublishPhase.failed);
      expect(failed.error, isA<ApiException>());
      expect(repo.created, isEmpty);

      repo.failCreate = null;
      await job.retry();
      expect(c.read(storyPublishJobProvider).phase, StoryPublishPhase.done);
      expect(repo.created, hasLength(1));
    });

    testWidgets('cancel ends the run and shows nothing', (tester) async {
      final repo = FakeStoriesRepository();
      final c = await _container(repo);
      final job = c.read(storyPublishJobProvider.notifier);
      unawaited(
        job.start(
          StoryDraft(
            kind: StoryKind.video,
            audience: StoryAudience.all,
            video: XFile.fromData(Uint8List(8), name: 'v.mp4'),
            videoDurationMs: 5000,
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 10));
      job.cancel();
      await tester.pump(const Duration(seconds: 10));
      expect(c.read(storyPublishJobProvider).phase, StoryPublishPhase.idle);
      expect(repo.created, isEmpty);
    });
  });
}
