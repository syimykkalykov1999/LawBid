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

import '../../helpers/upload_queue_overrides.dart';

Post fakePost(
  String id, {
  bool liked = false,
  int likes = 0,
  bool withPhoto = false,
  int photoHeight = 1080,
  PostPractice? practice,
  bool news = false,
  int comments = 0,
  bool mine = false,
}) =>
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
          ? [
              PostMedia(
                fileId: 'f1',
                url: 'https://example.test/1.jpg',
                previewUrl: 'https://example.test/1_320.jpg',
                mediumUrl: 'https://example.test/1_1080.jpg',
                width: 1080,
                height: photoHeight,
              ),
            ]
          : const [],
      tags: const ['dui'],
      likeCount: likes,
      commentCount: comments,
      likedByMe: liked,
      savedByMe: false,
      isMine: mine,
      practice: practice,
      isNews: news,
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
  bool failReposts = false;
  final likeCalls = <(String, bool)>[];
  final repostCalls = <(String, bool)>[];
  final followCalls = <(String, bool)>[];
  int attorneyPostsCalls = 0;

  @override
  Future<bool> attachmentsAllowed() async => true;

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
  Future<void> setReposted(String postId, {required bool reposted}) async {
    repostCalls.add((postId, reposted));
    if (failReposts) throw _offline;
  }

  @override
  Future<void> setFollowing(
    String attorneyId, {
    required bool following,
  }) async {
    followCalls.add((attorneyId, following));
  }

  @override
  Future<CursorPage<AttorneyRow>> suggestions({String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<CursorPage<Comment>> comments(
    String postId, {
    String? cursor,
  }) async =>
      const CursorPage(items: []);

  @override
  Future<CursorPage<Post>> attorneyPosts(
    String attorneyId, {
    String? cursor,
    bool newsOnly = false,
    ProfileMedia? media,
  }) async {
    attorneyPostsCalls++;
    attorneyPostsMedia.add(media);
    // Like the server's `media` filter (owner 2026-10-18).
    bool text(Post p) =>
        p.video == null && p.media.isEmpty && p.attachments.isEmpty;
    final kept = switch (media) {
      null => posts,
      ProfileMedia.video => [
          for (final p in posts)
            if (p.video != null) p,
        ],
      ProfileMedia.visual => [
          for (final p in posts)
            if (p.video == null && !text(p)) p,
        ],
      ProfileMedia.text => [
          for (final p in posts)
            if (text(p)) p,
        ],
    };
    return _page(kept, cursor);
  }

  /// The media filter of every [attorneyPosts] call.
  final attorneyPostsMedia = <ProfileMedia?>[];

  List<Post> reposts = const [];
  List<PersonRow> reposters = const [];
  List<PersonRow> likers = const [];

  /// Set: [attorneyPosts] and [userReposts] page by this many items (the
  /// cursor is the next index); null = everything on one page.
  int? pageSize;
  final userRepostsCursors = <String?>[];

  CursorPage<Post> _page(List<Post> all, String? cursor) {
    final size = pageSize;
    if (size == null) return CursorPage(items: all);
    final from = cursor == null ? 0 : int.parse(cursor);
    final to = (from + size).clamp(0, all.length);
    return CursorPage(
      items: all.sublist(from, to),
      nextCursor: to < all.length ? '$to' : null,
    );
  }

  @override
  Future<CursorPage<Post>> userReposts(
    String userId, {
    String? cursor,
  }) async {
    userRepostsCursors.add(cursor);
    return _page(reposts, cursor);
  }

  @override
  Future<CursorPage<PersonRow>> postLikers(
    String postId, {
    String? cursor,
  }) async =>
      CursorPage(items: likers);

  @override
  Future<CursorPage<PersonRow>> postReposters(
    String postId, {
    String? cursor,
  }) async =>
      CursorPage(items: reposters);

  @override
  Future<CursorPage<SavedPost>> savedPosts({String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
  }) async =>
      'file-1';

  /// Documents uploaded through [uploadPostDocument], in order.
  final uploadedDocuments = <String>[];

  @override
  Future<String> uploadPostDocument(
    Uint8List bytes,
    String mime, {
    required int maxBytes,
    void Function(double progress)? onProgress,
  }) async {
    uploadedDocuments.add(mime);
    onProgress?.call(1);
    return 'doc-${uploadedDocuments.length}';
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// In-memory [SearchRepository]: records every query it is asked.
class FakeSearchRepository implements SearchRepository {
  @override
  Future<List<SearchSuggestion>> suggest(String q) async => const [];

  final opened_ = <(String, SearchOpened, String)>[];

  @override
  void opened(String q, SearchOpened type, String id) =>
      opened_.add((q, type, id));

  final attorneyQueries = <String>[];
  List<AttorneyRow> attorneyResults = const [];
  List<TagInfo> trendingTags = const [];

  @override
  Future<CursorPage<AttorneyRow>> attorneys(
    String q,
    SearchFilters f, {
    String? cursor,
  }) async {
    attorneyQueries.add(q);
    return CursorPage(items: attorneyResults);
  }

  @override
  Future<CursorPage<PersonRow>> people(
    String q,
    SearchFilters f, {
    String? cursor,
  }) async {
    attorneyQueries.add(q);
    return CursorPage(
      items: attorneyResults.map(PersonRow.attorney).toList(),
    );
  }

  @override
  Future<CursorPage<FeedCase>> cases(
    String q,
    SearchFilters f, {
    String? cursor,
  }) async =>
      const CursorPage(items: []);

  @override
  Future<CursorPage<Post>> posts(
    String q, {
    String? cursor,
    SearchFilters filters = const SearchFilters(),
  }) async =>
      const CursorPage(items: []);

  @override
  Future<List<TagInfo>> tags(String q) async => const [];

  @override
  Future<List<TagInfo>> trending() async => trendingTags;
}

List<Override> socialOverrides([
  FakeSocialRepository? repo,
  FakeSearchRepository? search,
  List<Override>? uploadQueue,
]) =>
    [
      socialRepositoryProvider
          .overrideWithValue(repo ?? FakeSocialRepository()),
      searchRepositoryProvider
          .overrideWithValue(search ?? FakeSearchRepository()),
      ...uploadQueue ?? uploadQueueOverrides(),
      socialLocalDatabaseProvider.overrideWith((ref) {
        final db = SocialLocalDatabase(NativeDatabase.memory());
        ref.onDispose(db.close);
        return db;
      }),
    ];
