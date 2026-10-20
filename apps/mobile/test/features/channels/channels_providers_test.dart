import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/features/channels/application/channel_compose.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';

import 'channels_fakes.dart';

/// Owner 2026-10-20: the state behind the channel screens, against an
/// in-memory repository.
void main() {
  ProviderContainer boot(
    FakeChannelsRepository repo, {
    ChannelPhotoUploader? uploader,
  }) {
    final c = ProviderContainer(
      overrides: channelsOverrides(repo, uploader: uploader),
    );
    addTearDown(c.dispose);
    return c;
  }

  group('feed', () {
    test('loads the first page, then the next one', () async {
      final repo = FakeChannelsRepository(
        feed: [for (var i = 0; i < 5; i++) fakePost('p$i')],
      )..pageSize = 2;
      final c = boot(repo);
      final sub = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      addTearDown(sub.close);
      var list = await c.read(channelPostsProvider('ch-1').future);
      expect(list.items.map((p) => p.id), ['p0', 'p1']);
      expect(list.nextCursor, isNotNull);

      await c.read(channelPostsProvider('ch-1').notifier).loadMore();
      list = c.read(channelPostsProvider('ch-1')).requireValue;
      expect(list.items.map((p) => p.id), ['p0', 'p1', 'p2', 'p3']);

      await c.read(channelPostsProvider('ch-1').notifier).loadMore();
      list = c.read(channelPostsProvider('ch-1')).requireValue;
      expect(list.items, hasLength(5));
      expect(list.nextCursor, isNull);
    });

    test('a reaction counts at once and a second tap removes it', () async {
      final repo = FakeChannelsRepository(feed: [fakePost('p1')]);
      final c = boot(repo);
      final sub = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      addTearDown(sub.close);
      await c.read(channelPostsProvider('ch-1').future);
      final n = c.read(channelPostsProvider('ch-1').notifier);

      final post = c.read(channelPostsProvider('ch-1')).requireValue.items[0];
      await n.toggleReaction(post, '🔥');
      var now = c.read(channelPostsProvider('ch-1')).requireValue.items[0];
      expect(now.myReaction, '🔥');
      expect(now.countOf('🔥'), 1);

      await n.toggleReaction(now, '🔥');
      now = c.read(channelPostsProvider('ch-1')).requireValue.items[0];
      expect(now.myReaction, isNull);
      expect(now.countOf('🔥'), 0);
      expect(repo.calls, containsAll(['react:p1:🔥', 'unreact:p1']));
    });

    test('a failed reaction goes back and the error is rethrown', () async {
      final repo = FakeChannelsRepository(feed: [fakePost('p1')]);
      final c = boot(repo);
      final sub = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      addTearDown(sub.close);
      await c.read(channelPostsProvider('ch-1').future);
      final n = c.read(channelPostsProvider('ch-1').notifier);
      final post = c.read(channelPostsProvider('ch-1')).requireValue.items[0];

      repo.failWith = offline;
      await expectLater(n.toggleReaction(post, '👍'), throwsA(offline));
      final now = c.read(channelPostsProvider('ch-1')).requireValue.items[0];
      expect(now.myReaction, isNull);
      expect(now.countOf('👍'), 0);
    });

    test('shown posts are reported as viewed once, in one batch', () async {
      final repo = FakeChannelsRepository(
        feed: [fakePost('p1'), fakePost('p2')],
      );
      final c = boot(repo);
      final sub = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      addTearDown(sub.close);
      await c.read(channelPostsProvider('ch-1').future);
      final n = c.read(channelPostsProvider('ch-1').notifier)
        ..viewed('p1')
        ..viewed('p2')
        ..viewed('p1');
      expect(repo.viewed, isEmpty);
      await Future<void>.delayed(const Duration(milliseconds: 1200));
      expect(repo.viewed, [
        ['p1', 'p2'],
      ]);
      n.viewed('p2'); // already counted
      await Future<void>.delayed(const Duration(milliseconds: 1200));
      expect(repo.viewed, hasLength(1));
    });

    test('a removed post leaves the feed', () async {
      final repo = FakeChannelsRepository();
      final c = boot(repo);
      final sub = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      addTearDown(sub.close);
      final list = await c.read(channelPostsProvider('ch-1').future);
      await c
          .read(channelPostsProvider('ch-1').notifier)
          .remove(list.items.first);
      final now = c.read(channelPostsProvider('ch-1')).requireValue;
      expect(now.items.map((p) => p.id), ['p2']);
    });
  });

  group('channel', () {
    test('subscribe flips the channel and the count, unsubscribe undoes',
        () async {
      final repo = FakeChannelsRepository(channel: fakeChannel());
      final c = boot(repo);
      final sub = c.listen(channelProvider('tax_news'), (_, __) {});
      addTearDown(sub.close);
      await c.read(channelProvider('tax_news').future);
      final n = c.read(channelProvider('tax_news').notifier);

      await n.setSubscribed(on: true);
      var ch = c.read(channelProvider('tax_news')).requireValue;
      expect(ch.isSubscribed, isTrue);
      expect(ch.subscriberCount, 121);

      await n.setSubscribed(on: false);
      ch = c.read(channelProvider('tax_news')).requireValue;
      expect(ch.isSubscribed, isFalse);
      expect(ch.subscriberCount, 120);
      expect(repo.calls, containsAll(['subscribe', 'unsubscribe']));
    });

    test('a failed subscribe goes back', () async {
      final repo = FakeChannelsRepository(channel: fakeChannel());
      final c = boot(repo);
      final sub = c.listen(channelProvider('tax_news'), (_, __) {});
      addTearDown(sub.close);
      await c.read(channelProvider('tax_news').future);
      repo.failWith = offline;
      await expectLater(
        c.read(channelProvider('tax_news').notifier).setSubscribed(on: true),
        throwsA(offline),
      );
      final ch = c.read(channelProvider('tax_news')).requireValue;
      expect(ch.isSubscribed, isFalse);
      expect(ch.subscriberCount, 120);
    });

    test('mute is kept, and goes back on an error', () async {
      final repo = FakeChannelsRepository(
        channel: fakeChannel(subscribed: true),
      );
      final c = boot(repo);
      final sub = c.listen(channelProvider('tax_news'), (_, __) {});
      addTearDown(sub.close);
      await c.read(channelProvider('tax_news').future);
      final n = c.read(channelProvider('tax_news').notifier);

      await n.setMuted(muted: true);
      expect(c.read(channelProvider('tax_news')).requireValue.isMuted, isTrue);

      repo.failWith = offline;
      await expectLater(n.setMuted(muted: false), throwsA(offline));
      expect(c.read(channelProvider('tax_news')).requireValue.isMuted, isTrue);
    });
  });

  group('shares', () {
    test('the counter moves after the server confirmed the share', () async {
      final repo = FakeChannelsRepository(feed: [fakePost('p1')]);
      final c = boot(repo);
      final feed = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      addTearDown(feed.close);
      await c.read(channelPostsProvider('ch-1').future);
      await c.read(channelPostsProvider('ch-1').notifier).shared('p1');
      expect(repo.shares, ['p1']);
      expect(
        c.read(channelPostsProvider('ch-1')).requireValue.items[0].shareCount,
        1,
      );
      repo.failWith = offline;
      await c.read(channelPostsProvider('ch-1').notifier).shared('p1');
      expect(
        c.read(channelPostsProvider('ch-1')).requireValue.items[0].shareCount,
        1,
      );
    });
  });

  group('comments', () {
    test('adding and deleting move the post comment count', () async {
      final repo = FakeChannelsRepository(
        feed: [fakePost('p1', comments: 1)],
        commentList: [fakeComment('c-0', canDelete: true)],
      );
      final c = boot(repo);
      const key = (channelId: 'ch-1', postId: 'p1');
      final feed = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      final comments = c.listen(channelCommentsProvider(key), (_, __) {});
      addTearDown(feed.close);
      addTearDown(comments.close);
      await c.read(channelPostsProvider('ch-1').future);
      await c.read(channelCommentsProvider(key).future);
      final n = c.read(channelCommentsProvider(key).notifier);

      await n.add('Nice');
      expect(
        c.read(channelCommentsProvider(key)).requireValue.items,
        hasLength(2),
      );
      expect(
        c.read(channelPostsProvider('ch-1')).requireValue.items[0].commentCount,
        2,
      );

      await n.remove(
        c.read(channelCommentsProvider(key)).requireValue.items.first,
      );
      expect(
        c.read(channelCommentsProvider(key)).requireValue.items,
        hasLength(1),
      );
      expect(
        c.read(channelPostsProvider('ch-1')).requireValue.items[0].commentCount,
        1,
      );
    });
  });

  group('composer', () {
    Uint8List px() => Uint8List.fromList([1, 2, 3]);

    test('takes photos up to the limit and reports the rest', () async {
      final repo = FakeChannelsRepository();
      var n = 0;
      final c = boot(
        repo,
        uploader: (bytes, {onProgress}) async => 'f${n++}',
      );
      final sub = c.listen(channelComposeProvider('ch-1'), (_, __) {});
      addTearDown(sub.close);
      final compose = c.read(channelComposeProvider('ch-1').notifier);

      expect(compose.addPhotos([px(), px(), px()], max: 4), 0);
      expect(compose.addPhotos([px(), px(), px()], max: 4), 2);
      await Future<void>.delayed(Duration.zero);
      final s = c.read(channelComposeProvider('ch-1'));
      expect(s.photos, hasLength(4));
      expect(s.photosReady, isTrue);
    });

    test('a video and photos exclude each other', () {
      final repo = FakeChannelsRepository();
      final c = boot(
        repo,
        uploader: (bytes, {onProgress}) async => 'f',
      );
      final sub = c.listen(channelComposeProvider('ch-1'), (_, __) {});
      addTearDown(sub.close);
      final compose = c.read(channelComposeProvider('ch-1').notifier)
        ..setVideo(
          ChannelVideoDraft(
            file: XFile.fromData(px(), name: 'v.mp4'),
            durationSec: 10,
            size: 3,
            shortSide: 480,
          ),
        );
      expect(compose.addPhotos([px()], max: 4), 1);
      final s = c.read(channelComposeProvider('ch-1'));
      expect(s.photos, isEmpty);
      expect(s.video, isNotNull);
    });

    test('publishes uploaded photos with the text', () async {
      final repo = FakeChannelsRepository(feed: []);
      var n = 0;
      final c = boot(
        repo,
        uploader: (bytes, {onProgress}) async => 'f${n++}',
      );
      final feed = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      final sub = c.listen(channelComposeProvider('ch-1'), (_, __) {});
      addTearDown(feed.close);
      addTearDown(sub.close);
      await c.read(channelPostsProvider('ch-1').future);
      final compose = c.read(channelComposeProvider('ch-1').notifier)
        ..addPhotos([px(), px()], max: 4);
      await Future<void>.delayed(Duration.zero);

      final post = await compose.publish('Hello');
      expect(post, isNotNull);
      expect(repo.calls, contains('createPost:Hello:f0,f1:'));
      expect(
        c.read(channelPostsProvider('ch-1')).requireValue.items.first.id,
        'new',
      );
    });

    test('publishes a video: upload, wait until ready, then the post',
        () async {
      final repo = FakeChannelsRepository(feed: []);
      final c = boot(repo);
      final feed = c.listen(channelPostsProvider('ch-1'), (_, __) {});
      final phases = <ChannelComposePhase>[];
      final sub = c.listen(channelComposeProvider('ch-1'), (_, s) {
        if (phases.isEmpty || phases.last != s.phase) phases.add(s.phase);
      });
      addTearDown(feed.close);
      addTearDown(sub.close);
      await c.read(channelPostsProvider('ch-1').future);
      final compose = c.read(channelComposeProvider('ch-1').notifier)
        ..setVideo(
          ChannelVideoDraft(
            file: XFile.fromData(px(), name: 'v.mp4'),
            durationSec: 12,
            size: 3,
            shortSide: 480,
          ),
        );

      final post = await compose.publish('Watch');
      expect(post, isNotNull);
      expect(repo.uploadedVideos, [3]);
      expect(repo.calls, contains('createPost:Watch::va-1'));
      expect(
        phases,
        containsAllInOrder([
          ChannelComposePhase.uploading,
          ChannelComposePhase.processing,
          ChannelComposePhase.posting,
          ChannelComposePhase.idle,
        ]),
      );
    });

    test('a failed post cancels the uploaded video and keeps the error',
        () async {
      final repo = FakeChannelsRepository(feed: []);
      final c = boot(repo);
      final sub = c.listen(channelComposeProvider('ch-1'), (_, __) {});
      addTearDown(sub.close);
      final compose = c.read(channelComposeProvider('ch-1').notifier)
        ..setVideo(
          ChannelVideoDraft(
            file: XFile.fromData(px(), name: 'v.mp4'),
            durationSec: 12,
            size: 3,
            shortSide: 480,
          ),
        );
      repo.videoStatusNow = 'failed';
      await expectLater(compose.publish('x'), throwsA(isA<StateError>()));
      await Future<void>.delayed(Duration.zero);
      expect(repo.calls, contains('cancelVideo'));
      expect(c.read(channelComposeProvider('ch-1')).error, isNotNull);
      expect(
        c.read(channelComposeProvider('ch-1')).phase,
        ChannelComposePhase.idle,
      );
    });
  });
}
