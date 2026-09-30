import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/search/application/search_providers.dart';
import 'package:lawbid/features/search/data/search_repository.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

Post fakePost(String id,
        {bool liked = false, int likes = 0, bool withPhoto = false}) =>
    Post(
      id: id,
      author: const PostAuthor(
        id: 'att-1',
        username: 'saul',
        firstName: 'Saul',
        lastName: 'Goodman',
        verified: true,
      ),
      body: 'Know your rights #dui',
      media: withPhoto
          ? const [
              PostMedia(
                fileId: 'f1',
                url: 'https://example.test/1.jpg',
                previewUrl: 'https://example.test/1_320.jpg',
                mediumUrl: 'https://example.test/1_1080.jpg',
                width: 1080,
                height: 1080,
              ),
            ]
          : const [],
      tags: const ['dui'],
      likeCount: likes,
      commentCount: 0,
      likedByMe: liked,
      savedByMe: false,
      isMine: false,
      createdAt: DateTime(2026, 9, 28, 10),
    );

const _offline =
    ApiException(code: ApiException.networkErrorCode, message: 'offline');

/// In-memory [SocialRepository] for widget/unit tests.
class FakeSocialRepository implements SocialRepository {
  FakeSocialRepository({this.posts = const [], this.cached});

  List<Post> posts;
  CursorPage<Post>? cached;
  bool offline = false;
  bool failLikes = false;
  final likeCalls = <(String, bool)>[];
  final followCalls = <(String, bool)>[];

  @override
  Future<CursorPage<Post>> feed({String? cursor}) async {
    if (offline) throw _offline;
    return CursorPage(items: posts);
  }

  @override
  Future<CursorPage<Post>?> cachedFeed() async => cached;

  @override
  Future<Post> post(String id) async =>
      posts.firstWhere((p) => p.id == id, orElse: () => throw _offline);

  @override
  Future<void> setLiked(String postId, {required bool liked}) async {
    likeCalls.add((postId, liked));
    if (failLikes) throw _offline;
  }

  @override
  Future<void> setFollowing(String attorneyId,
      {required bool following}) async {
    followCalls.add((attorneyId, following));
  }

  @override
  Future<CursorPage<AttorneyRow>> suggestions({String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<CursorPage<Comment>> comments(String postId,
          {String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<CursorPage<Post>> attorneyPosts(String attorneyId,
          {String? cursor}) async =>
      CursorPage(items: posts);

  @override
  Future<CursorPage<SavedPost>> savedPosts({String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<String> uploadPostPhoto(Uint8List bytes,
          {void Function(double progress)? onProgress,
          bool casePhoto = false}) async =>
      'file-1';

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// In-memory [SearchRepository]: records every query it is asked.
class FakeSearchRepository implements SearchRepository {
  final attorneyQueries = <String>[];
  List<AttorneyRow> attorneyResults = const [];
  List<TagInfo> trendingTags = const [];

  @override
  Future<CursorPage<AttorneyRow>> attorneys(String q, SearchFilters f,
      {String? cursor}) async {
    attorneyQueries.add(q);
    return CursorPage(items: attorneyResults);
  }

  @override
  Future<CursorPage<PersonRow>> people(String q, SearchFilters f,
      {String? cursor}) async {
    attorneyQueries.add(q);
    return CursorPage(
        items: attorneyResults.map(PersonRow.attorney).toList());
  }

  @override
  Future<CursorPage<FeedCase>> cases(String q, SearchFilters f,
          {String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<CursorPage<Post>> posts(String q, {String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<List<TagInfo>> tags(String q) async => const [];

  @override
  Future<List<TagInfo>> trending() async => trendingTags;
}

List<Override> socialOverrides([
  FakeSocialRepository? repo,
  FakeSearchRepository? search,
]) =>
    [
      socialRepositoryProvider
          .overrideWithValue(repo ?? FakeSocialRepository()),
      searchRepositoryProvider
          .overrideWithValue(search ?? FakeSearchRepository()),
      socialLocalDatabaseProvider.overrideWith((ref) {
        final db = SocialLocalDatabase(NativeDatabase.memory());
        ref.onDispose(db.close);
        return db;
      }),
    ];
