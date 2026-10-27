import 'package:flutter/foundation.dart';
import 'package:lawbid/features/groups/domain/ongoing_call.dart';
import 'package:lawbid/features/social/domain/social_models.dart'
    show PostVideo;

/// Owner 2026-10-20: channels — Telegram-style one-to-many feeds of an
/// attorney or a company. Limits mirror the server
/// (apps/api/src/modules/channels/channels.dto.ts).
const int kChannelTitleMax = 64;
const int kChannelDescriptionMax = 255;
const int kChannelPostMax = 4000;
const int kChannelCommentMax = 1000;
const int kChannelDefaultMaxPostMedia = 10;

/// The reactions a reader can put on a post (one per reader).
const List<String> kChannelReactions = ['👍', '❤️', '🔥', '👏', '😮', '🙏'];

/// 5–32 letters, digits or `_`, starting with a letter, no `__`, no trailing
/// `_`, lowercase (Telegram; the server has the final word).
final RegExp channelUsernameRe =
    RegExp(r'^(?=.{5,32}$)[a-z](?:[a-z0-9]|_(?!_|$))*$');

/// What the reader typed → the form the server stores (no `@`, lowercase).
String normalizeChannelUsername(String raw) =>
    raw.trim().replaceFirst(RegExp('^@'), '').toLowerCase();

bool isValidChannelUsername(String raw) =>
    channelUsernameRe.hasMatch(normalizeChannelUsername(raw));

/// The lists of the channels screen.
enum ChannelScope { discover, subscribed, managed }

enum ChannelRole { owner, admin }

enum ChannelState { active, hidden, banned }

@immutable
class ChannelPerson {
  const ChannelPerson({
    required this.id,
    required this.username,
    required this.name,
    this.avatarUrl,
    this.verified = false,
  });

  final String id;
  final String username;

  /// First + last name, or the username when there is none.
  final String name;
  final String? avatarUrl;
  final bool verified;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    final letters =
        parts.take(2).map((p) => String.fromCharCode(p.runes.first)).join();
    return letters.toUpperCase();
  }
}

@immutable
class Channel {
  const Channel({
    required this.id,
    required this.title,
    required this.username,
    required this.commentsEnabled,
    required this.state,
    required this.subscriberCount,
    required this.postCount,
    required this.owner,
    required this.isSubscribed,
    required this.isMuted,
    required this.createdAt,
    this.description,
    this.avatarUrl,
    this.avatarFullUrl,
    this.myRole,
    this.lastPostAt,
    this.protectContent = false,
    this.ongoingCall,
    this.isPinned = false,
    this.isArchived = false,
    this.mutedUntil,
  });

  final String id;
  final String title;

  /// Lowercase, without `@`.
  final String username;
  final String? description;
  final String? avatarUrl;

  /// Full-size picture for the full-screen view.
  final String? avatarFullUrl;
  final bool commentsEnabled;
  final ChannelState state;
  final int subscriberCount;
  final int postCount;
  final ChannelPerson owner;
  final bool isSubscribed;
  final bool isMuted;
  final ChannelRole? myRole;
  final DateTime? lastPostAt;
  final DateTime createdAt;

  /// Owner 2026-10-21 (Telegram «Запретить копирование и пересылку»): the
  /// posts are not forwarded, copied or saved; sharing gives the link.
  final bool protectContent;

  /// Owner 2026-10-21 (inbox 20e, Telegram «Видеочат»): the call running in
  /// the channel now (subscribers and admins see it).
  final OngoingCallSummary? ongoingCall;

  /// Owner 2026-10-21 (inbox 22c, 27): my pin, my Archive of channels, and
  /// a timed mute («forever» is just [isMuted]).
  final bool isPinned;
  final bool isArchived;
  final DateTime? mutedUntil;

  bool get isOwner => myRole == ChannelRole.owner;
  bool get isAdmin => myRole != null;

  /// Hidden / banned channels are shown only to their admins.
  bool get isClosed => state != ChannelState.active;

  Channel copyWith({
    bool? isSubscribed,
    bool? isMuted,
    int? subscriberCount,
    bool? isPinned,
    bool? isArchived,
    DateTime? mutedUntil,
    bool clearMutedUntil = false,
  }) =>
      Channel(
        id: id,
        title: title,
        username: username,
        description: description,
        avatarUrl: avatarUrl,
        avatarFullUrl: avatarFullUrl,
        commentsEnabled: commentsEnabled,
        state: state,
        subscriberCount: subscriberCount ?? this.subscriberCount,
        postCount: postCount,
        owner: owner,
        isSubscribed: isSubscribed ?? this.isSubscribed,
        isMuted: isMuted ?? this.isMuted,
        myRole: myRole,
        lastPostAt: lastPostAt,
        createdAt: createdAt,
        protectContent: protectContent,
        ongoingCall: ongoingCall,
        isPinned: isPinned ?? this.isPinned,
        isArchived: isArchived ?? this.isArchived,
        mutedUntil: clearMutedUntil ? null : mutedUntil ?? this.mutedUntil,
      );
}

@immutable
class ChannelMedia {
  const ChannelMedia({
    required this.fileId,
    required this.url,
    required this.previewUrl,
  });

  final String fileId;
  final String url;
  final String previewUrl;
}

@immutable
class ChannelReactionCount {
  const ChannelReactionCount(this.emoji, this.count);

  final String emoji;
  final int count;
}

@immutable
class ChannelPost {
  const ChannelPost({
    required this.id,
    required this.channelId,
    required this.author,
    required this.body,
    required this.media,
    required this.viewCount,
    required this.commentCount,
    required this.reactions,
    required this.createdAt,
    this.shareCount = 0,
    this.video,
    this.myReaction,
    this.editedAt,
    this.forwardedFrom,
  });

  final String id;
  final String channelId;
  final ChannelPerson author;
  final String body;
  final List<ChannelMedia> media;
  final PostVideo? video;
  final int viewCount;
  final int commentCount;
  final int shareCount;
  final List<ChannelReactionCount> reactions;
  final String? myReaction;
  final DateTime createdAt;
  final DateTime? editedAt;

  /// Owner 2026-10-21: a forwarded post — «Forwarded from <name>».
  final String? forwardedFrom;

  int get reactionTotal => reactions.fold(0, (s, r) => s + r.count);

  int countOf(String emoji) {
    for (final r in reactions) {
      if (r.emoji == emoji) return r.count;
    }
    return 0;
  }

  /// This post as it looks when the reader's reaction becomes [emoji]
  /// (null = removed): counts follow at once, the server's answer replaces
  /// it a moment later.
  ChannelPost withMyReaction(String? emoji) {
    final counts = <String, int>{
      for (final r in reactions) r.emoji: r.count,
    };
    final old = myReaction;
    if (old != null) {
      final left = (counts[old] ?? 1) - 1;
      if (left <= 0) {
        counts.remove(old);
      } else {
        counts[old] = left;
      }
    }
    if (emoji != null) counts[emoji] = (counts[emoji] ?? 0) + 1;
    return copyWith(
      reactions: [
        for (final e in kChannelReactions)
          if (counts.containsKey(e)) ChannelReactionCount(e, counts[e]!),
        for (final e in counts.entries)
          if (!kChannelReactions.contains(e.key))
            ChannelReactionCount(e.key, e.value),
      ],
      myReaction: emoji,
      clearReaction: emoji == null,
    );
  }

  ChannelPost copyWith({
    String? body,
    int? commentCount,
    int? shareCount,
    int? viewCount,
    List<ChannelReactionCount>? reactions,
    String? myReaction,
    bool clearReaction = false,
    DateTime? editedAt,
  }) =>
      ChannelPost(
        id: id,
        channelId: channelId,
        author: author,
        body: body ?? this.body,
        media: media,
        video: video,
        viewCount: viewCount ?? this.viewCount,
        commentCount: commentCount ?? this.commentCount,
        shareCount: shareCount ?? this.shareCount,
        reactions: reactions ?? this.reactions,
        myReaction: clearReaction ? null : (myReaction ?? this.myReaction),
        createdAt: createdAt,
        editedAt: editedAt ?? this.editedAt,
        forwardedFrom: forwardedFrom,
      );
}

@immutable
class ChannelComment {
  const ChannelComment({
    required this.id,
    required this.author,
    required this.body,
    required this.createdAt,
    required this.canDelete,
  });

  final String id;
  final ChannelPerson author;
  final String body;
  final DateTime createdAt;
  final bool canDelete;
}

@immutable
class ChannelAdmin {
  const ChannelAdmin({required this.user, required this.role});

  final ChannelPerson user;
  final ChannelRole role;
}

/// What the create / edit form sends.
@immutable
class ChannelDraft {
  const ChannelDraft({
    required this.title,
    required this.username,
    required this.description,
    required this.commentsEnabled,
    this.avatarFileId,
    this.removeAvatar = false,
    this.protectContent,
  });

  final String title;
  final String username;
  final String description;
  final bool commentsEnabled;

  /// Editing only (null: unchanged).
  final bool? protectContent;
  final String? avatarFileId;
  final bool removeAvatar;
}

/// A cursor page (`meta.nextCursor`).
@immutable
class ChannelPage<T> {
  const ChannelPage(this.items, [this.nextCursor]);

  final List<T> items;
  final String? nextCursor;
}
