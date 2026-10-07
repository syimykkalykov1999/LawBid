import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/profile/data/avatar_upload_repository.dart'
    show ScanOutcome, sha256Hex, sniffImageMime;
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// docs/05 §3.2: post photos up to 10 MB each; at most 9 per post (owner
/// 2026-09-30, same as cases).
const kPostPhotoMaxBytes = 10 * 1024 * 1024;
const kPostMaxPhotos = 9;

/// docs/05 §3.1: post text limit (server-enforced too).
const kPostMaxChars = 2200;

/// Owner 2026-09-30: the card title limit (server-enforced too).
const kPostTitleMaxChars = 120;

/// Owner 2026-10-05: up to 9 documents (PDF, Word, text) per post, each
/// ≤ `files.post_attachment_max_size_mb` (10 MB by default; the server
/// enforces it and the total `posts.attachments_max_total_mb`).
const kPostMaxDocuments = 9;
const kPostDocumentDefaultMaxMb = 10;
const kPostDocumentsDefaultTotalMb = 30;

/// Extensions the document picker offers (same list as the server's
/// `post_attachment` rule, apps/api files.policy.ts).
const kPostDocumentExtensions = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];

/// MIME of a post document by its name, or null when not allowed.
String? postDocumentMimeForName(String name) {
  final dot = name.lastIndexOf('.');
  final ext = dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
  return switch (ext) {
    'pdf' => kPdfMime,
    'doc' => 'application/msword',
    'docx' =>
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt' => 'text/plain',
    'rtf' => 'application/rtf',
    'odt' => 'application/vnd.oasis.opendocument.text',
    _ => null,
  };
}

/// An uploaded document and the name readers download it under.
class PostDocumentRef {
  const PostDocumentRef({required this.fileId, required this.fileName});

  final String fileId;
  final String fileName;
}

/// What "+" publishes (owner 2026-09-30): title, text, the qualification,
/// Post or News (attorneys), photos in order.
class PostDraft {
  const PostDraft({
    required this.title,
    required this.body,
    this.practiceCode,
    this.isNews = false,
    this.mediaFileIds = const [],
    this.videoAssetId,
    this.locationName,
    this.commentsEnabled = true,
    this.attachments = const [],
    this.markedLegal = false,
  });

  /// Owner 2026-10-05: without a topic a post is general (personal); the
  /// author marks it legal here. A topic or News is always legal.
  final bool markedLegal;

  /// Owner 2026-10-05: documents in order (≤ [kPostMaxDocuments]).
  final List<PostDocumentRef> attachments;

  /// Owner 2026-10-01: a reel — the uploaded video instead of photos.
  final String? videoAssetId;

  /// Owner 2026-10-02: place shown under the author's name.
  final String? locationName;
  final bool commentsEnabled;

  final String title;
  final String body;

  /// Owner 2026-10-01: optional (general news has no area of law).
  final String? practiceCode;
  final bool isNews;
  final List<String> mediaFileIds;
}

/// docs/05 §5.1: comment length 1–1000.
const kCommentMaxChars = 1000;

/// Owner 2026-09-30 (OQ-034): comments under a case reuse the post comment
/// UI. A case thread id and its comment ids carry this prefix, so the
/// repository routes each call to the case-comment API.
const kCaseThreadPrefix = 'case:';

bool isCaseRef(String id) => id.startsWith(kCaseThreadPrefix);
String _raw(String id) =>
    isCaseRef(id) ? id.substring(kCaseThreadPrefix.length) : id;
String caseThreadId(String caseId) => '$kCaseThreadPrefix$caseId';

const kPdfMime = 'application/pdf';
const kDocxMime =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/// OQ-034: PDF ("%PDF-") or Word .docx (a ZIP with the Word part), by the
/// leading bytes — the server re-checks the same way.
String? sniffDocumentMime(Uint8List b) {
  if (b.length >= 5 && String.fromCharCodes(b.sublist(0, 5)) == '%PDF-') {
    return kPdfMime;
  }
  if (b.length >= 30 &&
      b[0] == 0x50 &&
      b[1] == 0x4B &&
      b[2] == 3 &&
      b[3] == 4) {
    final head =
        String.fromCharCodes(b.sublist(0, b.length < 65536 ? b.length : 65536));
    if (head.contains('[Content_Types].xml') && head.contains('word/')) {
      return kDocxMime;
    }
  }
  return null;
}

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

  /// [newsOnly]: the profile's News tab (owner 2026-09-30).
  Future<CursorPage<Post>> attorneyPosts(
    String attorneyId, {
    String? cursor,
    bool newsOnly = false,
  });
  Future<CursorPage<Post>> tagPosts(
    String tag,
    TagSort sort, {
    String? cursor,
    String? state,
  });

  /// OQ-034: newest posts (of attorneys licensed in [state] when given);
  /// owner 2026-09-30: of a qualification ([practice], a category with its
  /// subcategories; older posts by their topic [tag]) and only News.
  Future<CursorPage<Post>> latestPosts(
    String? state, {
    String? cursor,
    String? practice,
    String? tag,
    bool newsOnly = false,
    // Audit 2026-10-01: Search-tab filters on the server.
    String? period,
    bool withPhotos = false,
    bool popular = false,
    // Owner 2026-10-05: the "Posts" topic — general (personal) posts only.
    bool generalOnly = false,
    // Owner 2026-10-06: several states at once, and «Юр. посты» →
    // «Только мои темы» (any of these qualifications).
    List<String> states = const [],
    List<String> practices = const [],
  });
  Future<Post> createPost(PostDraft draft);
  Future<Post> updatePost(
    String id, {
    required String body,
    String? title,
    String? practiceCode,
    bool? markedLegal,
  });
  Future<void> deletePost(String id);

  /// Owner 2026-10-05: the feed shows legal posts only (general, personal
  /// posts hidden in the feed, topics, search and recommendations).
  Future<bool> legalOnlyFeed();
  Future<void> setLegalOnlyFeed({required bool legalOnly});
  Future<void> setLiked(String postId, {required bool liked});

  /// Owner 2026-10-07: Threads-style repost / undo (idempotent).
  Future<void> setReposted(String postId, {required bool reposted});

  /// OQ-037: count a completed share of a post / a case.
  Future<void> recordPostShare(String postId);
  Future<void> recordCaseShare(String caseId);
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
  Future<CursorPage<PersonRow>> following(String attorneyId, {String? cursor});
  Future<CursorPage<AttorneyRow>> suggestions({String? cursor});

  Future<void> report(
    ReportTarget target,
    String id,
    ReportReason reason, {
    String? note,
  });

  /// Presign → upload → confirm → wait for a clean scan; returns the file
  /// id to attach to a post (docs/05 §3.2). [fileName] names a case
  /// document by extension; [maxBytes] is the admin's MB per file.
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
  });

  /// Owner 2026-10-05: a post document (PDF, Word, text) through the same
  /// pipeline; returns the clean file id. [maxBytes] is the admin limit.
  Future<String> uploadPostDocument(
    Uint8List bytes,
    String mime, {
    required int maxBytes,
    void Function(double progress)? onProgress,
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
        _caseComments = api.CaseCommentsClient(apiDio),
        _follows = api.FollowsClient(apiDio),
        _search = api.SearchClient(apiDio),
        _cases = api.CasesClient(apiDio),
        _reports = api.ReportsClient(apiDio),
        _files = api.FilesClient(apiDio),
        _storage = storageDio;

  final api.FeedClient _feed;
  final api.PostsClient _posts;
  final api.CommentsClient _comments;
  final api.CaseCommentsClient _caseComments;
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
  Future<bool> legalOnlyFeed() async =>
      (await guardApiCall(_feed.getPreferences)).data.contentMode ==
      api.FeedContentMode.legalOnly;

  @override
  Future<void> setLegalOnlyFeed({required bool legalOnly}) => guardApiCall(
        () => _feed.setPreferences(
          body: api.FeedPreferencesDto(
            contentMode: legalOnly
                ? api.FeedContentMode.legalOnly
                : api.FeedContentMode.all,
          ),
        ),
      );

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
        (await guardApiCall(() => _posts.getPost(id: id))).data,
      );

  @override
  Future<CursorPage<Post>> attorneyPosts(
    String attorneyId, {
    String? cursor,
    bool newsOnly = false,
  }) async {
    final env = await guardApiCall(
      () => _posts.listAttorneyPosts(
        id: attorneyId,
        cursor: cursor,
        // The Posts tab must not repeat the News tab's items.
        kind: newsOnly ? api.PostKind.news : api.PostKind.post,
      ),
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
    String? state,
  }) async {
    final env = await guardApiCall(
      () => _search.tagPosts(
        tag: tag,
        sort: sort == TagSort.top ? api.Sort3.top : api.Sort3.valueNew,
        cursor: cursor,
        state: state,
        videoOnly: sort == TagSort.video ? true : null,
      ),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<Post>> latestPosts(
    String? state, {
    String? cursor,
    String? practice,
    String? tag,
    bool newsOnly = false,
    String? period,
    bool withPhotos = false,
    bool popular = false,
    bool generalOnly = false,
    List<String> states = const [],
    List<String> practices = const [],
  }) async {
    final env = await guardApiCall(
      () => _search.latestPosts(
        state: state,
        states: states.isEmpty ? null : states.join(','),
        practices: practices.isEmpty ? null : practices.join(','),
        cursor: cursor,
        practice: practice,
        tag: tag,
        kind: newsOnly ? api.PostKind.news : null,
        period: period == null ? null : api.Period.fromJson(period),
        withPhotos: withPhotos ? true : null,
        sort: popular ? api.LatestPostsSort.popular : null,
        contentClass: generalOnly ? api.PostContentClass.general : null,
      ),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.post).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<Post> createPost(PostDraft draft) async => SocialMappers.post(
        (await guardApiCall(
          () => _posts.createPost(
            body: api.CreatePostDto(
              title: draft.title,
              practiceCode: draft.practiceCode,
              kind: draft.isNews ? api.PostKind.news : api.PostKind.post,
              contentClass:
                  draft.markedLegal ? api.PostContentClass.legal : null,
              body: draft.body,
              mediaFileIds:
                  draft.mediaFileIds.isEmpty ? null : draft.mediaFileIds,
              videoAssetId: draft.videoAssetId,
              location: draft.locationName == null
                  ? null
                  : api.PostLocationDto(name: draft.locationName!),
              commentsEnabled: draft.commentsEnabled,
              attachments: draft.attachments.isEmpty
                  ? null
                  : [
                      for (final a in draft.attachments)
                        api.PostAttachmentInputDto(
                          fileId: a.fileId,
                          fileName: a.fileName,
                        ),
                    ],
            ),
            extras: _createsResource,
          ),
        ))
            .data,
      );

  @override
  Future<Post> updatePost(
    String id, {
    required String body,
    String? title,
    String? practiceCode,
    bool? markedLegal,
  }) async =>
      SocialMappers.post(
        (await guardApiCall(
          () => _posts.updatePost(
            id: id,
            body: api.UpdatePostDto(
              body: body,
              title: title,
              practiceCode: practiceCode,
              contentClass: markedLegal == null
                  ? null
                  : (markedLegal
                      ? api.PostContentClass.legal
                      : api.PostContentClass.general),
            ),
          ),
        ))
            .data,
      );

  @override
  Future<void> deletePost(String id) =>
      guardApiCall(() => _posts.deletePost(id: id));

  @override
  Future<void> recordPostShare(String postId) =>
      guardApiCall(() => _posts.sharePost(id: postId));

  @override
  Future<void> recordCaseShare(String caseId) =>
      guardApiCall(() => _caseComments.shareCase(id: caseId));

  @override
  Future<void> setLiked(String postId, {required bool liked}) => guardApiCall(
        () =>
            liked ? _posts.likePost(id: postId) : _posts.unlikePost(id: postId),
      );

  @override
  Future<void> setReposted(String postId, {required bool reposted}) =>
      guardApiCall(
        () => reposted
            ? _posts.repostPost(id: postId)
            : _posts.unrepostPost(id: postId),
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
    if (isCaseRef(postId)) {
      final env = await guardApiCall(
        () => _caseComments.listCaseComments(id: _raw(postId), cursor: cursor),
      );
      return CursorPage(
        items: env.data.map(SocialMappers.caseComment).toList(),
        nextCursor: env.meta?.nextCursor,
      );
    }
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
    if (isCaseRef(commentId)) {
      final env = await guardApiCall(
        () => _caseComments.listCaseCommentReplies(
          id: _raw(commentId),
          cursor: cursor,
        ),
      );
      return CursorPage(
        items: env.data.map(SocialMappers.caseComment).toList(),
        nextCursor: env.meta?.nextCursor,
      );
    }
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
  }) async {
    if (isCaseRef(postId)) {
      return SocialMappers.caseComment(
        (await guardApiCall(
          () => _caseComments.createCaseComment(
            id: _raw(postId),
            body: api.CreateCommentDto(
              body: body,
              parentCommentId: parentId == null ? null : _raw(parentId),
            ),
            extras: _createsResource,
          ),
        ))
            .data,
      );
    }
    return SocialMappers.comment(
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
  }

  @override
  Future<void> deleteComment(String commentId) => guardApiCall(
        () => isCaseRef(commentId)
            ? _caseComments.deleteCaseComment(id: _raw(commentId))
            : _comments.deleteComment(id: commentId),
      );

  @override
  Future<void> setCommentLiked(String commentId, {required bool liked}) {
    final raw = _raw(commentId);
    return guardApiCall(
      () => isCaseRef(commentId)
          ? (liked
              ? _caseComments.likeCaseComment(id: raw)
              : _caseComments.unlikeCaseComment(id: raw))
          : (liked
              ? _comments.likeComment(id: commentId)
              : _comments.unlikeComment(id: commentId)),
    );
  }

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
  Future<CursorPage<PersonRow>> following(
    String attorneyId, {
    String? cursor,
  }) async {
    // OQ-038: attorneys and clients.
    final env = await guardApiCall(
      () => _follows.listFollowing(id: attorneyId, cursor: cursor),
    );
    return CursorPage(
      items: env.data.map(SocialMappers.person).whereType<PersonRow>().toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

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
              ReportTarget.comment when isCaseRef(id) =>
                api.ReportTargetType.caseComment,
              ReportTarget.comment => api.ReportTargetType.comment,
              ReportTarget.message => api.ReportTargetType.message,
              ReportTarget.user => api.ReportTargetType.user,
              ReportTarget.stickerPack => api.ReportTargetType.stickerPack,
            },
            targetId: _raw(id),
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
    // Owner 2026-10-01: photos in reviews (public, like post photos).
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
  }) async {
    // OQ-034: a case also takes documents next to photos; owner
    // 2026-10-07 (bug 17): any format the admin turned on, by its name.
    final image = sniffImageMime(bytes);
    final named = fileName == null ? null : uploadMimeForName(fileName);
    final doc = casePhoto && image == null
        ? sniffDocumentMime(bytes) ??
            (named != null && !named.startsWith('image/') ? named : null)
        : null;
    final mime = image ?? doc;
    if (mime == null) {
      throw const ApiException(
        code: ApiErrorCodes.fileTypeNotAllowed,
        message: 'type',
      );
    }
    if (bytes.length > (maxBytes ?? kPostPhotoMaxBytes)) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    return _upload(
      bytes,
      mime,
      purpose: doc != null
          ? api.FilePurpose.caseAttachment
          : casePhoto
              ? api.FilePurpose.casePhoto
              : reviewPhoto
                  ? api.FilePurpose.reviewPhoto
                  : api.FilePurpose.postImage,
      filename: doc == null
          ? 'photo.${mime.split('/').last}'
          : doc == kPdfMime
              ? 'document.pdf'
              : doc == kDocxMime
                  ? 'document.docx'
                  : (fileName ?? 'document'),
      onProgress: onProgress,
    );
  }

  @override
  Future<String> uploadPostDocument(
    Uint8List bytes,
    String mime, {
    required int maxBytes,
    void Function(double progress)? onProgress,
  }) async {
    if (_extOf(mime).isEmpty) {
      throw const ApiException(
        code: ApiErrorCodes.fileTypeNotAllowed,
        message: 'type',
      );
    }
    if (bytes.length > maxBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    return _upload(
      bytes,
      mime,
      purpose: api.FilePurpose.postAttachment,
      filename: 'document.${_extOf(mime)}',
      onProgress: onProgress,
    );
  }

  static String _extOf(String mime) => switch (mime) {
        kPdfMime => 'pdf',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' =>
          'docx',
        'text/plain' => 'txt',
        'application/rtf' => 'rtf',
        'application/vnd.oasis.opendocument.text' => 'odt',
        _ => '',
      };

  /// Presign → S3 POST → confirm → wait for a clean scan.
  Future<String> _upload(
    Uint8List bytes,
    String mime, {
    required api.FilePurpose purpose,
    required String filename,
    void Function(double progress)? onProgress,
  }) async {
    final target = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: purpose,
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
            filename: filename,
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
          isClient: d.author.role == api.PostAuthorDtoRole.client,
        ),
        body: d.body,
        media: [
          for (final m in [
            ...d.media,
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
        locationName: d.location?.name,
        commentsEnabled: d.commentsEnabled,
        tags: d.tags,
        mentions: [for (final m in d.mentions) SocialMappers.mention(m)],
        title: d.title,
        isNews: d.kind == api.PostKind.news,
        isGeneral: d.contentClass == api.PostContentClass.general,
        practice: d.practice == null
            ? null
            : PostPractice(
                code: d.practice!.code,
                categoryCode: d.practice!.categoryCode,
                nameEn: d.practice!.nameEn,
                i18nKey: d.practice!.i18nKey,
              ),
        likeCount: d.likeCount,
        commentCount: d.commentCount,
        shareCount: d.shareCount,
        repostCount: d.repostCount,
        repostedByMe: d.repostedByMe,
        likedByMe: d.likedByMe,
        savedByMe: d.savedByMe,
        isMine: d.isMine,
        createdAt: DateTime.parse(d.createdAt),
        editedAt: d.editedAt == null ? null : DateTime.parse(d.editedAt!),
        status: d.status.name,
        video: d.video == null
            ? null
            : PostVideo(
                status: d.video!.status.json ?? d.video!.status.name,
                playbackUrl: d.video!.playbackUrl,
                thumbnailUrl: d.video!.thumbnailUrl,
                durationSec: d.video!.durationSec,
                width: d.video!.width,
                height: d.video!.height,
                trimStartMs: d.video!.trimStartMs,
                trimEndMs: d.video!.trimEndMs,
              ),
        attachments: [
          for (final a in [
            ...d.attachments,
          ]..sort((a, b) => a.position.compareTo(b.position)))
            PostAttachment(
              fileId: a.fileId,
              fileName: a.fileName,
              mime: a.mime,
              sizeBytes: a.sizeBytes,
              url: a.url,
            ),
        ],
        promotionId: d.promotionId,
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
        mentions: [for (final m in d.mentions) mention(m)],
      );

  /// OQ-042.
  static Mention mention(api.MentionDto m) => Mention(
        username: m.username,
        userId: m.userId,
        isAttorney: m.kind == api.MentionKind.attorney,
      );

  /// OQ-034: a comment under a case, ids prefixed (see kCaseThreadPrefix).
  static Comment caseComment(api.CaseCommentDto d) => Comment(
        id: caseThreadId(d.id),
        postId: caseThreadId(d.caseId),
        parentId:
            d.parentCommentId == null ? null : caseThreadId(d.parentCommentId!),
        author: CommentAuthor(
          isAttorney: d.author.kind == api.CommentAuthorDtoKind.attorney,
          attorneyId: d.author.attorneyId,
          username: d.author.username,
          displayName: d.author.displayName,
          avatarUrl: d.author.avatarUrl,
          verified: d.author.verifiedBadge,
          isCaseOwner: d.byCaseOwner,
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
        trustLevel: d.trustLevel,
        ratingAvg: d.rating.avg.toDouble(),
        ratingCount: d.rating.count.toInt(),
        states: d.states,
        practiceKeys: d.practiceI18nKeys,
        isFollowing: d.isFollowing,
      );
}
