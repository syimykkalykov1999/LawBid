import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/social/data/social_repository.dart';

/// App audit 2026-10-26 C20: a post deleted on this phone came back for a
/// second after a restart — the feed (and a profile tab) opens on the
/// phone's copy saved before the delete. A deleted post is now left out of
/// that copy too, also after a restart.
class _Server implements HttpClientAdapter {
  final requests = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add('${options.method} ${options.path}');
    if (options.method == 'DELETE') {
      return _json({
        'data': {'deleted': true},
      });
    }
    // A profile tab: the copy the server still had (or the phone's).
    return _json({
      'data': [_post('p1'), _post('p2')],
    });
  }

  ResponseBody _json(Object body) => ResponseBody.fromString(
        jsonEncode(body),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );

  @override
  void close({bool force = false}) {}
}

ApiSocialRepository _repo(SocialLocalDatabase db, _Server server) {
  final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
    ..httpClientAdapter = server;
  return ApiSocialRepository(
    apiDio: dio,
    storageDio: dio,
    local: db,
    ownerId: 'u1',
  );
}

void main() {
  test('a deleted post is not in the saved feed copy after a restart',
      () async {
    final db = SocialLocalDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    await db.savePage(
      'feed:u1',
      jsonEncode({
        'data': [_post('p1'), _post('p2')],
      }),
    );
    final server = _Server();
    await _repo(db, server).deletePost('p1');

    // The app starts again: a new repository on the same disk.
    final copy = await _repo(db, server).cachedFeed();
    expect(copy!.items.map((p) => p.id), ['p2']);
  });

  test('a profile tab page leaves out a post deleted here', () async {
    final db = SocialLocalDatabase(NativeDatabase.memory());
    addTearDown(db.close);
    final server = _Server();
    await _repo(db, server).deletePost('p1');

    final page = await _repo(db, server).attorneyPosts('a1');
    expect(page.items.map((p) => p.id), ['p2']);
  });
}

Map<String, Object?> _post(String id) => {
      'id': id,
      'commentsEnabled': true,
      'likesHidden': false,
      'viewsHidden': false,
      'kind': 'post',
      'contentClass': 'legal',
      'author': {
        'id': 'a1',
        'role': 'attorney',
        'username': 'anna',
        'verifiedBadge': true,
        'isFollowing': false,
        'trustLevel': 1,
        'practiceI18nKeys': <Object?>[],
        'advertisingLabel': false,
      },
      'body': 'Hello world',
      'media': <Object?>[],
      'attachments': <Object?>[],
      'tags': <Object?>[],
      'mentions': <Object?>[],
      'status': 'published',
      'likeCount': 0,
      'commentCount': 0,
      'saveCount': 0,
      'shareCount': 0,
      'viewCount': 0,
      'repostCount': 0,
      'createdAt': '2026-10-01T10:00:00.000Z',
      'savedByMe': false,
      'repostedByMe': false,
      'likedByMe': false,
      'isMine': false,
    };
