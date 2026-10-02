// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/foundation.dart';

/// docs/05 §2.4 post author: an attorney's public identity.
@immutable
class PostAuthor {
  const PostAuthor({
    required this.id,
    required this.username,
    required this.verified,
    this.firstName,
    this.lastName,
    this.avatarUrl,
    this.isFollowing = false,
    this.isClient = false,
  });

  /// OQ-038: clients publish posts too (their profile is /client/:username).
  final bool isClient;

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final bool verified;

  /// Owner 2026-09-30: the viewer follows this author (card Follow button).
  final bool isFollowing;

  String get displayName {
    final name = [firstName, lastName].whereType<String>().join(' ').trim();
    return name.isEmpty ? '@$username' : name;
  }

  String get initials {
    final parts = [firstName, lastName]
        .whereType<String>()
        .where((p) => p.isNotEmpty)
        .map((p) => p[0].toUpperCase());
    final s = parts.join();
    return s.isEmpty ? username.substring(0, 1).toUpperCase() : s;
  }
}

/// One photo of a post (docs/05 §3.2): 1080 px for the feed, 320 px
/// previews for grids, the original for zoom.
@immutable
class PostMedia {
  const PostMedia({
    required this.fileId,
    required this.url,
    required this.previewUrl,
    required this.mediumUrl,
    this.width,
    this.height,
  });

  final String fileId;
  final String url;
  final String previewUrl;
  final String mediumUrl;
  final int? width;
  final int? height;

  double get aspectRatio {
    final w = width;
    final h = height;
    if (w == null || h == null || w == 0 || h == 0) return 1;
    // Instagram-like bounds: 4:5 portrait … 1.91:1 landscape.
    return (w / h).clamp(0.8, 1.91);
  }
}

/// OQ-042: a real person @mentioned in a post or comment.
@immutable
class Mention {
  const Mention({
    required this.username,
    required this.userId,
    required this.isAttorney,
  });

  /// Lowercase, as in the text after "@".
  final String username;
  final String userId;
  final bool isAttorney;
}

@immutable

/// Owner 2026-09-30: a post's qualification (a practice category or
/// subcategory).
@immutable
class PostPractice {
  const PostPractice({
    required this.code,
    required this.categoryCode,
    required this.nameEn,
    required this.i18nKey,
  });

  final String code;
  final String categoryCode;
  final String nameEn;
  final String i18nKey;
}

/// Owner 2026-10-01: a reel's video (Bunny Stream). [playbackUrl] is an
/// HLS playlist, null until the video is ready.
class PostVideo {
  const PostVideo({
    required this.status,
    this.playbackUrl,
    this.thumbnailUrl,
    this.durationSec,
    this.width,
    this.height,
  });

  /// `awaiting_upload` | `processing` | `ready` | `failed` | `rejected` | `deleted`.
  final String status;
  final String? playbackUrl;
  final String? thumbnailUrl;
  final int? durationSec;
  final int? width;
  final int? height;

  bool get ready => status == 'ready' && playbackUrl != null;

  /// Width / height; reels default to 9:16.
  double get aspectRatio => (width != null && height != null && height! > 0)
      ? width! / height!
      : 9 / 16;
}

class Post {
  const Post({
    required this.id,
    required this.author,
    required this.body,
    required this.media,
    required this.tags,
    required this.likeCount,
    required this.commentCount,
    required this.likedByMe,
    required this.savedByMe,
    required this.isMine,
    required this.createdAt,
    this.editedAt,
    this.status = 'published',
    this.shareCount = 0,
    this.mentions = const [],
    this.title,
    this.isNews = false,
    this.practice,
    this.video,
  });

  /// Owner 2026-10-01: a reel — the post's video instead of photos.
  final PostVideo? video;

  /// Owner 2026-09-30: the card title; null on older posts (the body's
  /// first line is shown instead).
  final String? title;

  /// Owner 2026-09-30: News (attorneys only) rather than a regular post.
  final bool isNews;

  /// Owner 2026-09-30: the qualification; null on older posts.
  final PostPractice? practice;

  /// OQ-037: completed shares.
  final int shareCount;

  /// OQ-042: people @mentioned in [body] (links to their profiles).
  final List<Mention> mentions;

  final String id;
  final PostAuthor author;
  final String body;
  final List<PostMedia> media;
  final List<String> tags;
  final int likeCount;
  final int commentCount;
  final bool likedByMe;
  final bool savedByMe;
  final bool isMine;
  final DateTime createdAt;
  final DateTime? editedAt;

  /// `published` | `hidden` | `removed` (docs/05 §12). Only the author
  /// ever receives a non-published post: docs/06 §3.3 "Пост на проверке".
  final String status;

  bool get pendingReview => isMine && status == 'hidden';

  Post copyWith({
    String? title,
    PostPractice? practice,
    String? body,
    List<String>? tags,
    int? likeCount,
    int? commentCount,
    bool? likedByMe,
    bool? savedByMe,
    DateTime? editedAt,
    int? shareCount,
  }) =>
      Post(
        id: id,
        author: author,
        body: body ?? this.body,
        media: media,
        tags: tags ?? this.tags,
        likeCount: likeCount ?? this.likeCount,
        commentCount: commentCount ?? this.commentCount,
        likedByMe: likedByMe ?? this.likedByMe,
        savedByMe: savedByMe ?? this.savedByMe,
        isMine: isMine,
        createdAt: createdAt,
        editedAt: editedAt ?? this.editedAt,
        status: status,
        shareCount: shareCount ?? this.shareCount,
        mentions: mentions,
        title: title ?? this.title,
        isNews: isNews,
        practice: practice ?? this.practice,
        video: video,
      );
}

/// docs/05 §5.2: an attorney by public profile, a client only as
/// "Anna K." (no id, no photo).
@immutable
class CommentAuthor {
  const CommentAuthor({
    required this.isAttorney,
    required this.displayName,
    required this.verified,
    this.attorneyId,
    this.username,
    this.avatarUrl,
    this.isCaseOwner = false,
  });

  /// OQ-034: the client who owns the case (shown as "Case owner").
  final bool isCaseOwner;

  final bool isAttorney;
  final String? attorneyId;
  final String? username;
  final String displayName;
  final String? avatarUrl;
  final bool verified;
}

@immutable
class Comment {
  const Comment({
    required this.id,
    required this.postId,
    required this.author,
    required this.body,
    required this.likeCount,
    required this.replyCount,
    required this.likedByMe,
    required this.canDelete,
    required this.isMine,
    required this.createdAt,
    this.parentId,
    this.mentions = const [],
  });

  final String id;
  final String postId;
  final String? parentId;

  /// OQ-042: people @mentioned in [body].
  final List<Mention> mentions;
  final CommentAuthor author;
  final String body;
  final int likeCount;
  final int replyCount;
  final bool likedByMe;
  final bool canDelete;
  final bool isMine;
  final DateTime createdAt;

  Comment copyWith({int? likeCount, int? replyCount, bool? likedByMe}) =>
      Comment(
        id: id,
        postId: postId,
        parentId: parentId,
        author: author,
        body: body,
        likeCount: likeCount ?? this.likeCount,
        replyCount: replyCount ?? this.replyCount,
        likedByMe: likedByMe ?? this.likedByMe,
        canDelete: canDelete,
        isMine: isMine,
        createdAt: createdAt,
        mentions: mentions,
      );
}

/// An attorney row: follows, suggestions, search (docs/05 §6, §7.3).
@immutable
class AttorneyRow {
  const AttorneyRow({
    required this.id,
    required this.username,
    required this.verified,
    required this.ratingAvg,
    required this.ratingCount,
    required this.states,
    required this.practiceKeys,
    required this.isFollowing,
    this.firstName,
    this.lastName,
    this.avatarUrl,
  });

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final bool verified;
  final double ratingAvg;
  final int ratingCount;
  final List<String> states;
  final List<String> practiceKeys;
  final bool isFollowing;

  String get displayName {
    final name = [firstName, lastName].whereType<String>().join(' ').trim();
    return name.isEmpty ? '@$username' : name;
  }

  AttorneyRow copyWith({bool? isFollowing}) => AttorneyRow(
        id: id,
        username: username,
        firstName: firstName,
        lastName: lastName,
        avatarUrl: avatarUrl,
        verified: verified,
        ratingAvg: ratingAvg,
        ratingCount: ratingCount,
        states: states,
        practiceKeys: practiceKeys,
        isFollowing: isFollowing ?? this.isFollowing,
      );
}

/// "Моё → Сохранённое" (docs/05 §4): [post] is null when the post was
/// deleted or hidden since — shown as "Пост недоступен".
@immutable
class SavedPost {
  const SavedPost({required this.postId, required this.savedAt, this.post});

  final String postId;
  final DateTime savedAt;
  final Post? post;
}

/// docs/05 §7.5 hashtag; [postsCount] only for trending tags.
@immutable
class TagInfo {
  const TagInfo({required this.tag, this.postsCount});

  final String tag;
  final int? postsCount;
}

enum TagSort { top, fresh }

/// `report_reason` (docs/02); the screen text is `report.reason.<name>`.
enum ReportReason {
  spam,
  abuse,
  misinformation,
  impersonation,
  inappropriate,
  other,
}

enum ReportTarget { post, comment, message, user }

/// A client in People search / followers (OQ-026): name, handle, avatar,
/// state — never contacts.
@immutable
class ClientRow {
  const ClientRow({
    required this.id,
    required this.username,
    required this.stateCode,
    this.firstName,
    this.lastName,
    this.avatarUrl,
    this.verified = false,
  });

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final String stateCode;

  /// OQ-029 final: blue check for a confirmed phone number.
  final bool verified;

  String get displayName {
    final name = [firstName, lastName].whereType<String>().join(' ').trim();
    return name.isEmpty ? '@$username' : name;
  }
}

/// One row of a mixed people list: exactly one of [attorney]/[client].
@immutable
class PersonRow {
  const PersonRow.attorney(AttorneyRow row)
      : attorney = row,
        client = null;
  const PersonRow.client(ClientRow row)
      : attorney = null,
        client = row;

  final AttorneyRow? attorney;
  final ClientRow? client;

  String get id => attorney?.id ?? client!.id;
  String get username => attorney?.username ?? client!.username;
}
