import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart'
    show ScanOutcome, sha256Hex, sniffImageMime;
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// docs/05 §3.2: post photos up to 10 MB each, at most 10 per post.
const kPostPhotoMaxBytes = 10 * 1024 * 1024;
const kPostMaxPhotos = 10;

/// docs/05 §3.1: post text limit (server-enforced too).
const kPostMaxChars = 2200;

/// docs/05 §5.1: comment length 1–1000.
const kCommentMaxChars = 1000;

const Map<String, dynamic> _createsResource = {
  RequestFlags.createsResource: true,
};

/// docs/05 §2–§6 for the app: feed, posts, likes, saves, comments,
/// follows, suggestions, tag pages, reports. Throws [ApiException].
/// Network access only through here (.cursorrules).
abstract interface class SocialRepository {
  Future<CursorPage<Post>> feed({String? cursor});

  /// The last first page seen online (docs/05 §2.2.6), for offline.
  Future<CursorPage<Post>?> cachedFeed();
  Future<Post> post(String id);
  Future<CursorPage<Post>> attorneyPosts(String attorneyId, {String? cursor});
  Future<CursorPage<Post>> tagPosts(
    String tag,
    TagSort sort, {
    String? cursor,
  });
  Future<Post> createPost(String body, List<String> mediaFileIds);
  Future<Post> updatePost(String id, String body);
  Future<void> deletePost(String id);
  Future<void> setLiked(String postId, {required bool liked});
  Future<void> setSaved(String postId, {required bool saved});
  Future<CursorPage<SavedPost>> savedPosts({String? cursor});

  Future<CursorPage<Comment>> comments(String postId, {String? cursor});
  Future<CursorPage<Comment>> replies(String commentId, {String? cursor});
  Future<Comment> addComment(String postId, String body, {String? parentId});
  Future<void> deleteComment(String commentId);
  Future<void> setCommentLiked(String commentId, {required bool liked});

  Future<void> setFollowing(String attorneyId, {required bool following});

  /// OQ-026: attorneys and clients who follow [attorneyId].
  Future<CursorPage<PersonRow>> followers(
    String attorneyId, {
    String? cursor,
  });
  Future<CursorPage<AttorneyRow>> following(
    String attorneyId, {
    String? cursor,
  });
  Future<CursorPage<AttorneyRow>> myFollowing({String? cursor});
  Future<CursorPage<AttorneyRow>> suggestions({String? cursor});

  Future<void> report(
    ReportTarget target,
    String id,
    ReportReason reason, {
    String? note,
  });

  /// Presign → upload → confirm → wait for a clean scan; returns the file
  /// id to attach to a post (docs/05 §3.2).
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
  });
}

class ApiSocialRepository implements SocialRepository {
  ApiSocialRepository({
    required Dio apiDio,
    required Dio storageDio,
    required SocialLocalDatabase local,
    required String? ownerId,
  })  : _local = local,
        _ownerId = ownerId,
        _feed = api.FeedClient(apiDio),
        _posts = api.PostsClient(apiDio),
        _comments = api.CommentsClient(apiDio),
        _follows = api.FollowsClient(apiDio),
        _search = api.SearchClient(apiDio),
        _cases = api.CasesClient(apiDio),
        _reports = api.ReportsClient(apiDio),
        _files = api.FilesClient(apiDio),
        _storage = storageDio;

  final api.FeedClient _feed;
  final api.PostsClient _posts;
  final api.CommentsClient _comments;
  final api.FollowsClient _follows;
  final api.SearchClient _search;
  final api.CasesClient _cases;
  final api.ReportsClient _reports;
  final api.FilesClient _files;
  final Dio _storage;
  final SocialLocalDatabase _local;
  final String? _ownerId;

  static const _scanPoll = Duration(seconds: 1);
  static const _scanMaxPolls = 30;

  @override
  Future<CursorPage<Post>> feed({String? cursor}) async {
    final env = await guardApiCall(() => _feed.getFeed(cursor: cursor));
    final owner = _ownerId;
    if (cursor == null && owner != null) {
      await _local.savePage('feed:$owner', jsonEncode(env.toJson()));
    }
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<Post>?> cachedFeed() async {
    final owner = _ownerId;
    if (owner == null) return null;
    final json = await _local.pageJson('feed:$owner');
    if (json == null) return null;
    try {
      final env = api.PostListEnvelope.fromJson(
        jsonDecode(json) as Map<String, dynamic>,
      );
      // Offline: no next page to load.
      return CursorPage(items: env.data.map(SocialMappers.post).toList());
    } on Object {
      return null;
    }
  }

  @override
  Future<Post> post(String id) async => SocialMappers.post(
      (await guardApiCall(() => _posts.getPost(id: id))).data);

  @override
  Future<CursorPage<Post>> attorneyPosts(
    String attorneyId, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _posts.listAttorneyPosts(id: attorneyId, cursor: cursor),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<Post>> tagPosts(
    String tag,
    TagSort sort, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _search.tagPosts(
        tag: tag,
        sort: sort == TagSort.top ? api.Sort2.top : api.Sort2.valueNew,
        cursor: cursor,
      ),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<Post> createPost(String body, List<String> mediaFileIds) async =>
      SocialMappers.post(
        (await guardApiCall(
          () => _posts.createPost(
            body: api.CreatePostDto(
              body: body,
              mediaFileIds: mediaFileIds.isEmpty ? null : mediaFileIds,
            ),
            extras: _createsResource,
          ),
        ))
            .data,
      );

  @override
  Future<Post> updatePost(String id, String body) async => SocialMappers.post(
        (await guardApiCall(
          () => _posts.updatePost(id: id, body: api.UpdatePostDto(body: body)),
        ))
            .data,
      );

  @override
  Future<void> deletePost(String id) =>
      guardApiCall(() => _posts.deletePost(id: id));

  @override
  Future<void> setLiked(String postId, {required bool liked}) => guardApiCall(
        () =>
            liked ? _posts.likePost(id: postId) : _posts.unlikePost(id: postId),
      );

  @override
  Future<void> setSaved(String postId, {required bool saved}) {
    final body =
        api.SavedItemDto(itemType: api.SavedItemType.post, itemId: postId);
    return guardApiCall(
      () => saved ? _cases.saveItem(body: body) : _cases.unsaveItem(body: body),
    );
  }

  @override
  Future<CursorPage<SavedPost>> savedPosts({String? cursor}) async {
    final env = await guardApiCall(() => _posts.listSavedPosts(cursor: cursor));
    return CursorPage(
      items: env.data
          .map(
            (s) => SavedPost(
              postId: s.postId,
              savedAt: DateTime.parse(s.savedAt),
              post: s.available && s.post != null
                  ? SocialMappers.post(s.post!)
                  : null,
            ),
          )
          .toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<Comment>> comments(String postId, {String? cursor}) async {
    final env = await guardApiCall(
      () => _comments.listComments(id: postId, cursor: cursor),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.comment).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<Comment>> replies(
    String commentId, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _comments.listReplies(id: commentId, cursor: cursor),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.comment).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<Comment> addComment(
    String postId,
    String body, {
    String? parentId,
  }) async =>
      SocialMappers.comment(
        (await guardApiCall(
          () => _comments.createComment(
            id: postId,
            body: api.CreateCommentDto(
              body: body,
              parentCommentId: parentId,
            ),
            extras: _createsResource,
          ),
        ))
            .data,
      );

  @override
  Future<void> deleteComment(String commentId) =>
      guardApiCall(() => _comments.deleteComment(id: commentId));

  @override
  Future<void> setCommentLiked(String commentId, {required bool liked}) =>
      guardApiCall(
        () => liked
            ? _comments.likeComment(id: commentId)
            : _comments.unlikeComment(id: commentId),
      );

  @override
  Future<void> setFollowing(String attorneyId, {required bool following}) =>
      guardApiCall(
        () => following
            ? _follows.followAttorney(id: attorneyId)
            : _follows.unfollowAttorney(id: attorneyId),
      );

  Future<CursorPage<AttorneyRow>> _rows(
    Future<api.AttorneyListItemListEnvelope> Function() call,
  ) async {
    final env = await guardApiCall(call);
    return CursorPage(
      items: env.data.map(SocialMappers.attorney).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<PersonRow>> followers(
    String attorneyId, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _follows.listFollowers(id: attorneyId, cursor: cursor),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.person).whereType<PersonRow>().toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<AttorneyRow>> following(
    String attorneyId, {
    String? cursor,
  }) =>
      _rows(() => _follows.listFollowing(id: attorneyId, cursor: cursor));

  @override
  Future<CursorPage<AttorneyRow>> myFollowing({String? cursor}) =>
      _rows(() => _follows.listMyFollowing(cursor: cursor));

  @override
  Future<CursorPage<AttorneyRow>> suggestions({String? cursor}) =>
      _rows(() => _follows.listSuggestedAttorneys(cursor: cursor));

  @override
  Future<void> report(
    ReportTarget target,
    String id,
    ReportReason reason, {
    String? note,
  }) =>
      guardApiCall(
        () => _reports.createReport(
          body: api.CreateReportDto(
            targetType: switch (target) {
              ReportTarget.post => api.ReportTargetType.post,
              ReportTarget.comment => api.ReportTargetType.comment,
              ReportTarget.message => api.ReportTargetType.message,
              ReportTarget.user => api.ReportTargetType.user,
            },
            targetId: id,
            reason: api.ReportReason.values.byName(reason.name),
            note: note,
          ),
        ),
      );

  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    // OQ-031: the same pipeline for private case photos.
    bool casePhoto = false,
  }) async {
    final mime = sniffImageMime(bytes);
    if (mime == null) {
      throw const ApiException(
        code: ApiErrorCodes.fileTypeNotAllowed,
        message: 'type',
      );
    }
    if (bytes.length > kPostPhotoMaxBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    final target = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: casePhoto
              ? api.FilePurpose.casePhoto
              : api.FilePurpose.postImage,
          mime: mime,
          sizeBytes: bytes.length,
          sha256: sha256Hex(bytes),
        ),
        extras: _createsResource,
      ),
    ))
        .data;
    final parts = mime.split('/');
    try {
      await _storage.post<void>(
        target.upload.url,
        data: FormData.fromMap({
          ...target.upload.fields,
          // S3 POST policy: the file must be the LAST field.
          'file': MultipartFile.fromBytes(
            bytes,
            filename: 'photo.${parts.last}',
            contentType: DioMediaType(parts.first, parts.last),
          ),
        }),
        onSendProgress: (sent, total) {
          if (total > 0) onProgress?.call(sent / total);
        },
      );
    } on DioException catch (e) {
      throw ApiException(
        code: e.response == null
            ? ApiException.networkErrorCode
            : ApiErrorCodes.fileNotUploaded,
        message: 'Upload to storage failed.',
        statusCode: e.response?.statusCode,
      );
    }
    var outcome = _scan(
      (await guardApiCall(
        () => _files.confirm(id: target.fileId),
      ))
          .data
          .scanStatus,
    );
    for (var i = 0; outcome == ScanOutcome.pending && i < _scanMaxPolls; i++) {
      await Future<void>.delayed(_scanPoll);
      outcome = _scan(
        (await guardApiCall(
          () => _files.getFilesId(id: target.fileId),
        ))
            .data
            .scanStatus,
      );
    }
    if (outcome != ScanOutcome.clean) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'scan',
      );
    }
    return target.fileId;
  }

  static ScanOutcome _scan(api.ScanStatus status) => switch (status) {
        api.ScanStatus.clean => ScanOutcome.clean,
        api.ScanStatus.pending => ScanOutcome.pending,
        _ => ScanOutcome.rejected,
      };
}

/// Generated DTO → app model. Kept apart so screens never see DTOs.
abstract final class SocialMappers {
  static Post post(api.PostDto d) => Post(
        id: d.id,
        author: PostAuthor(
          id: d.author.id,
          username: d.author.username,
          firstName: d.author.firstName,
          lastName: d.author.lastName,
          avatarUrl: d.author.avatarUrl,
          verified: d.author.verifiedBadge,
          isFollowing: d.author.isFollowing,
        ),
        body: d.body,
        media: [
          for (final m in [
            ...d.media
          ]..sort((a, b) => a.position.compareTo(b.position)))
            PostMedia(
              fileId: m.fileId,
              url: m.url,
              previewUrl: m.previewUrl,
              mediumUrl: m.mediumUrl,
              width: m.width,
              height: m.height,
            ),
        ],
        tags: d.tags,
        likeCount: d.likeCount,
        commentCount: d.commentCount,
        likedByMe: d.likedByMe,
        savedByMe: d.savedByMe,
        isMine: d.isMine,
        createdAt: DateTime.parse(d.createdAt),
        editedAt: d.editedAt == null ? null : DateTime.parse(d.editedAt!),
        status: d.status.name,
      );

  static Comment comment(api.CommentDto d) => Comment(
        id: d.id,
        postId: d.postId,
        parentId: d.parentCommentId,
        author: CommentAuthor(
          isAttorney: d.author.kind == api.CommentAuthorDtoKind.attorney,
          attorneyId: d.author.attorneyId,
          username: d.author.username,
          displayName: d.author.displayName,
          avatarUrl: d.author.avatarUrl,
          verified: d.author.verifiedBadge,
        ),
        body: d.body,
        likeCount: d.likeCount,
        replyCount: d.replyCount,
        likedByMe: d.likedByMe,
        canDelete: d.canDelete,
        isMine: d.isMine,
        createdAt: DateTime.parse(d.createdAt),
      );

  static ClientRow client(api.ClientListItemDto d) => ClientRow(
        id: d.id,
        username: d.username,
        firstName: d.firstName,
        lastName: d.lastName,
        avatarUrl: d.avatarUrl,
        stateCode: d.stateCode,
        verified: d.verifiedBadge,
      );

  /// null for a row of an unknown role (a newer server).
  static PersonRow? person(api.PersonItemDto d) {
    if (d.attorney != null) return PersonRow.attorney(attorney(d.attorney!));
    if (d.client != null) return PersonRow.client(client(d.client!));
    return null;
  }

  static AttorneyRow attorney(api.AttorneyListItemDto d) => AttorneyRow(
        id: d.id,
        username: d.username,
        firstName: d.firstName,
        lastName: d.lastName,
        avatarUrl: d.avatarUrl,
        verified: d.verifiedBadge,
        ratingAvg: d.rating.avg.toDouble(),
        ratingCount: d.rating.count.toInt(),
        states: d.states,
        practiceKeys: d.practiceI18nKeys,
        isFollowing: d.isFollowing,
      );
}
