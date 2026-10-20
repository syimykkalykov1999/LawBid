import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/channels/data/channels_repository.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';

import '../../helpers/fake_http_adapter.dart';

Map<String, Object?> userJson() => {
      'id': 'u1',
      'role': 'attorney',
      'username': 'saul',
      'firstName': 'Saul',
      'lastName': 'Goodman',
      'verifiedBadge': true,
    };

Map<String, Object?> channelJson({
  bool subscribed = false,
  String? role,
}) =>
    {
      'id': 'ch-1',
      'title': 'Tax news',
      'username': 'tax_news',
      'description': 'Weekly',
      'avatarUrl': null,
      'commentsEnabled': true,
      'status': 'active',
      'subscriberCount': 7,
      'postCount': 2,
      'owner': userJson(),
      'isSubscribed': subscribed,
      'isMuted': false,
      'myRole': role,
      'lastPostAt': null,
      'createdAt': '2026-10-01T10:00:00.000Z',
    };

Map<String, Object?> postJson(String id) => {
      'id': id,
      'channelId': 'ch-1',
      'author': userJson(),
      'body': 'Hello',
      'media': [
        {
          'fileId': 'f1',
          'url': 'https://x.test/1',
          'previewUrl': 'https://x.test/1p'
        },
      ],
      'video': {'status': 'ready', 'playbackUrl': 'https://x.test/v.m3u8'},
      'viewCount': 5,
      'commentCount': 2,
      'reactions': [
        {'emoji': '👍', 'count': 3},
      ],
      'myReaction': '👍',
      'createdAt': '2026-10-19T10:00:00.000Z',
      'editedAt': null,
    };

/// Bunny's TUS endpoint: creates the upload, then takes PATCH chunks.
class _Tus implements HttpClientAdapter {
  final patches = <({int offset, int length})>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (options.method == 'POST') {
      return ResponseBody.fromString(
        '',
        201,
        headers: {
          'location': ['/tusupload/abc'],
        },
      );
    }
    final body = <int>[];
    await requestStream?.forEach(body.addAll);
    final offset = int.parse('${options.headers['Upload-Offset']}');
    patches.add((offset: offset, length: body.length));
    return ResponseBody.fromString(
      '',
      204,
      headers: {
        'upload-offset': ['${offset + body.length}'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late FakeHttpAdapter http;
  late ChannelsRepository repo;

  setUp(() {
    http = FakeHttpAdapter((o) async => ok(null));
    repo = ChannelsRepository(
      apiDio: Dio()..httpClientAdapter = http,
      storageDio: Dio(),
    );
  });

  test('the lists ask the server for their scope and search text', () async {
    http.handler = (_) async => ok([channelJson()]);
    final found = await repo.list(ChannelScope.discover, q: ' tax ');
    final r = http.requests.single;
    expect(r.path, '/channels');
    expect(r.queryParameters, {'q': 'tax', 'scope': 'discover'});
    expect(found.single.title, 'Tax news');
    expect(found.single.owner.verified, isTrue);
    expect(found.single.owner.name, 'Saul Goodman');

    await repo.list(ChannelScope.managed);
    expect(http.requests.last.queryParameters, {'scope': 'managed'});
  });

  test('subscribe, unsubscribe and mute use the subscription resource',
      () async {
    final c = (await (() async {
      http.handler = (_) async => ok(channelJson());
      return repo.get('tax_news');
    })());
    expect(http.requests.last.path, '/channels/tax_news');

    http.handler = (_) async =>
        ok({'isSubscribed': true, 'isMuted': false, 'subscriberCount': 8});
    final on = await repo.subscribe(c);
    expect(http.requests.last.method, 'PUT');
    expect(http.requests.last.path, '/channels/ch-1/subscription');
    expect(on.isSubscribed, isTrue);
    expect(on.subscriberCount, 8);

    await repo.unsubscribe(on);
    expect(http.requests.last.method, 'DELETE');

    http.handler = (_) async =>
        ok({'isSubscribed': true, 'isMuted': true, 'subscriberCount': 8});
    final muted = await repo.mute(on, muted: true);
    expect(http.requests.last.method, 'PATCH');
    expect(http.requests.last.data, {'muted': true});
    expect(muted.isMuted, isTrue);
  });

  test('posts come page by page with their media, video and reactions',
      () async {
    http.handler = (_) async => jsonBody({
          'data': [postJson('p1')],
          'meta': {'nextCursor': 'c2'},
        });
    final page = await repo.posts('ch-1');
    expect(page.nextCursor, 'c2');
    final p = page.items.single;
    expect(p.media.single.url, 'https://x.test/1');
    expect(p.video!.ready, isTrue);
    expect(p.countOf('👍'), 3);
    expect(p.myReaction, '👍');

    await repo.posts('ch-1', cursor: 'c2');
    expect(http.requests.last.queryParameters['cursor'], 'c2');
  });

  test('reacting sends the emoji, removing it deletes the reaction', () async {
    http.handler = (_) async => ok(postJson('p1'));
    await repo.react('ch-1', 'p1', '❤️');
    var r = http.requests.last;
    expect(r.method, 'PUT');
    expect(r.path, '/channels/ch-1/posts/p1/reaction');
    expect(r.data, {'emoji': '❤️'});
    await repo.unreact('ch-1', 'p1');
    r = http.requests.last;
    expect(r.method, 'DELETE');
  });

  test('a post carries its text, photo ids and video asset', () async {
    http.handler = (_) async => ok(postJson('p1'));
    await repo.createPost(
      'ch-1',
      body: ' Hi ',
      mediaFileIds: ['f1', 'f2'],
    );
    expect(http.requests.last.data, {
      'body': 'Hi',
      'mediaFileIds': ['f1', 'f2'],
    });
    await repo.createPost('ch-1', body: '', videoAssetId: 'va');
    expect(http.requests.last.data, {'videoAssetId': 'va'});
    // Creating is safe to retry: it carries an idempotency key.
    expect(http.requests.last.extra['createsResource'], isTrue);
  });

  test('an edit sends the text only', () async {
    http.handler = (_) async => ok(postJson('p1'));
    await repo.editPost('ch-1', 'p1', ' New ');
    expect(http.requests.last.method, 'PATCH');
    expect(http.requests.last.data, {'body': 'New'});
  });

  test('comments page, add and delete', () async {
    http.handler = (_) async => jsonBody({
          'data': [
            {
              'id': 'c1',
              'author': userJson(),
              'body': 'Nice',
              'createdAt': '2026-10-19T11:00:00.000Z',
              'canDelete': true,
            },
          ],
          'meta': {'nextCursor': null},
        });
    final page = await repo.comments('ch-1', 'p1');
    expect(page.items.single.canDelete, isTrue);
    expect(page.nextCursor, isNull);

    http.handler = (_) async => ok({
          'id': 'c2',
          'author': userJson(),
          'body': 'Hi',
          'createdAt': '2026-10-19T11:00:00.000Z',
          'canDelete': true,
        });
    final c = await repo.addComment('ch-1', 'p1', ' Hi ');
    expect(c.body, 'Hi');
    expect(http.requests.last.data, {'body': 'Hi'});
    await repo.removeComment('ch-1', 'p1', 'c2');
    expect(http.requests.last.path, '/channels/ch-1/posts/p1/comments/c2');
  });

  test('admins: list, add by @username, remove', () async {
    http.handler = (_) async => ok([
          {'user': userJson(), 'role': 'owner'},
        ]);
    final admins = await repo.admins('ch-1');
    expect(admins.single.role, ChannelRole.owner);
    await repo.addAdmin('ch-1', '@Anna_Law');
    expect(http.requests.last.data, {'username': 'anna_law'});
    await repo.removeAdmin('ch-1', 'u9');
    expect(http.requests.last.path, '/channels/ch-1/admins/u9');
  });

  test('a taken @username comes back as its server code', () async {
    http.handler = (_) async => apiError(409, 'CHANNEL_USERNAME_TAKEN');
    await expectLater(
      repo.create(
        const ChannelDraft(
          title: 'T',
          username: 'taken_name',
          description: '',
          commentsEnabled: true,
        ),
      ),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'CHANNEL_USERNAME_TAKEN'),
      ),
    );
  });

  test('create sends the form as the server expects it', () async {
    http.handler = (_) async => ok(channelJson(role: 'owner'));
    final c = await repo.create(
      const ChannelDraft(
        title: ' Tax news ',
        username: '@Tax_News',
        description: ' ',
        commentsEnabled: false,
        avatarFileId: 'file-1',
      ),
    );
    expect(http.requests.last.data, {
      'title': 'Tax news',
      'username': 'tax_news',
      'avatarFileId': 'file-1',
      'commentsEnabled': false,
    });
    expect(c.myRole, ChannelRole.owner);
  });

  test('an edit renames only when asked and can drop the picture', () async {
    http.handler = (_) async => ok(channelJson(role: 'owner'));
    await repo.update(
      'ch-1',
      const ChannelDraft(
        title: 'T',
        username: 'x',
        description: 'd',
        commentsEnabled: true,
        removeAvatar: true,
      ),
    );
    expect(http.requests.last.data, {
      'title': 'T',
      'description': 'd',
      'removeAvatar': true,
      'commentsEnabled': true,
    });
    await repo.update(
      'ch-1',
      const ChannelDraft(
        title: 'T',
        username: 'x',
        description: 'd',
        commentsEnabled: true,
      ),
      username: 'New_Name',
    );
    expect(http.requests.last.data['username'], 'new_name');
  });

  test('a channel or a post is reported with its target type', () async {
    await repo.report(targetId: 'ch-1', reason: 'spam');
    expect(http.requests.last.data, {
      'targetType': 'channel',
      'targetId': 'ch-1',
      'reason': 'spam',
    });
    await repo.report(targetId: 'p1', reason: 'abuse', post: true);
    expect(http.requests.last.data['targetType'], 'channel_post');
  });

  test('the avatar goes presign → storage → confirm with purpose avatar',
      () async {
    final storage =
        FakeHttpAdapter((o) async => ResponseBody.fromString('', 204));
    http.handler = (o) async {
      if (o.path.endsWith('/presign')) {
        return ok({
          'fileId': 'file-9',
          'upload': {
            'url': 'https://storage.test/up',
            'fields': {'key': 'k'},
          },
          'expiresAt': '2026-10-20T10:00:00.000Z',
        });
      }
      return ok({
        'id': 'file-9',
        'purpose': 'avatar',
        'mime': 'image/png',
        'sizeBytes': 3,
        'scanStatus': 'clean',
        'createdAt': '2026-10-20T10:00:00.000Z',
      });
    };
    final withStorage = ChannelsRepository(
      apiDio: Dio()..httpClientAdapter = http,
      storageDio: Dio()..httpClientAdapter = storage,
    );
    final id = await withStorage.uploadAvatar(
      Uint8List.fromList([1, 2, 3]),
      'image/png',
    );
    expect(id, 'file-9');
    final presign = http.requests.first;
    expect(presign.data['purpose'], 'avatar');
    expect(presign.data['mime'], 'image/png');
    expect(storage.requests.single.uri.toString(), 'https://storage.test/up');
    expect(http.requests.last.path, '/files/file-9/confirm');
  });

  test('a dirty avatar is refused, not attached', () async {
    final storage =
        FakeHttpAdapter((o) async => ResponseBody.fromString('', 204));
    http.handler = (o) async {
      if (o.path.endsWith('/presign')) {
        return ok({
          'fileId': 'file-9',
          'upload': {
            'url': 'https://storage.test/up',
            'fields': <String, String>{}
          },
          'expiresAt': '2026-10-20T10:00:00.000Z',
        });
      }
      return ok({
        'id': 'file-9',
        'purpose': 'avatar',
        'mime': 'image/png',
        'sizeBytes': 3,
        'scanStatus': 'infected',
        'createdAt': '2026-10-20T10:00:00.000Z',
      });
    };
    final withStorage = ChannelsRepository(
      apiDio: Dio()..httpClientAdapter = http,
      storageDio: Dio()..httpClientAdapter = storage,
    );
    await expectLater(
      withStorage.uploadAvatar(Uint8List.fromList([1, 2, 3]), 'image/png'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', ApiErrorCodes.fileNotAttachable),
      ),
    );
  });

  test('a video goes to Bunny in 5 MB TUS chunks, bytes intact', () async {
    final tus = _Tus();
    final bunny = ChannelsRepository(
      apiDio: Dio(),
      storageDio: Dio()..httpClientAdapter = tus,
    );
    final data =
        Uint8List.fromList(List.generate(6 * 1024 * 1024 + 7, (i) => i % 251));
    final progress = <double>[];
    await bunny.uploadVideo(
      XFile.fromData(data, name: 'v.mp4', mimeType: 'video/mp4'),
      const ChannelVideoUpload(
        videoAssetId: 'va1',
        tusEndpoint: 'https://video.bunnycdn.com/tusupload',
        libraryId: '1',
        videoId: 'vid',
        signature: 'sig',
        expire: 123,
        maxDurationSec: 180,
      ),
      onProgress: progress.add,
    );
    expect(tus.patches.map((p) => p.offset), [0, 5 * 1024 * 1024]);
    expect(
      tus.patches.fold<int>(0, (s, p) => s + p.length),
      data.length,
    );
    expect(progress.last, 1);
  });

  test('the video asset status is read until it is ready', () async {
    http.handler = (_) async => ok({'id': 'va', 'status': 'processing'});
    expect(await repo.videoStatus('va'), 'processing');
    http.handler = (_) async => ok({'id': 'va', 'status': 'ready'});
    expect(await repo.videoStatus('va'), 'ready');
    expect(jsonEncode(http.requests.last.path), '"/videos/va"');
  });
}
