import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart' show XFile;

/// Owner 2026-10-20 — stories: a photo, a short video or a text card with
/// emoji stickers, visible for 24 hours. These are the app's own types; the
/// repository maps the API DTOs to them.
enum StoryKind { photo, video, text }

enum StoryAudience { all, followers, contacts }

/// The server's limits (stories.dto.ts): text 280, 10 stickers, 15 s video.
const int kStoryTextMax = 280;
const int kStoryOverlaysMax = 10;
const int kStoryDefaultVideoSec = 15;

/// How long a photo or a text card stays on screen.
const Duration kStoryStillDuration = Duration(seconds: 5);

/// The keys the server accepts for a text story's `background`; the app
/// draws the gradient of each one (see story_backgrounds.dart).
const List<String> kStoryBackgrounds = [
  'gold',
  'navy',
  'wine',
  'forest',
  'plum',
  'slate',
  'sunset',
  'ocean',
];

@immutable
class StoryUser {
  const StoryUser({
    required this.id,
    required this.username,
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
  final bool verified;

  /// "First Last", or the @username when the name is not set.
  String get displayName {
    final name = [firstName, lastName]
        .whereType<String>()
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .join(' ');
    return name.isEmpty ? '@$username' : name;
  }

  String get initials {
    final parts = displayName
        .replaceFirst('@', '')
        .split(' ')
        .where((s) => s.isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    final first = String.fromCharCode(parts.first.runes.first).toUpperCase();
    if (parts.length == 1) return first;
    return first +
        String.fromCharCode(parts.last.runes.first).toUpperCase();
  }
}

/// An emoji sticker on a story. [x], [y] are fractions (0..1) of the frame,
/// the centre of the sticker; [scale] 0.3..4; [rotation] in radians.
@immutable
class StoryOverlay {
  const StoryOverlay({
    required this.emoji,
    required this.x,
    required this.y,
    this.scale = 1,
    this.rotation = 0,
  });

  final String emoji;
  final double x;
  final double y;
  final double scale;
  final double rotation;

  StoryOverlay copyWith({
    double? x,
    double? y,
    double? scale,
    double? rotation,
  }) =>
      StoryOverlay(
        emoji: emoji,
        x: x ?? this.x,
        y: y ?? this.y,
        scale: scale ?? this.scale,
        rotation: rotation ?? this.rotation,
      );
}

/// A story's video: the HLS stream (phones), the MP4 copy (browsers) and
/// the part of it that plays.
@immutable
class StoryVideo {
  const StoryVideo({
    required this.ready,
    this.playbackUrl,
    this.fallbackUrl,
    this.thumbnailUrl,
    this.durationSec,
    this.trimStartMs,
    this.trimEndMs,
  });

  final bool ready;
  final String? playbackUrl;
  final String? fallbackUrl;
  final String? thumbnailUrl;
  final int? durationSec;
  final int? trimStartMs;
  final int? trimEndMs;

  String? urlFor({required bool web}) =>
      web ? (fallbackUrl ?? playbackUrl) : playbackUrl;

  Duration get clipStart => Duration(milliseconds: trimStartMs ?? 0);

  /// The end of the part that plays; null = to the end of the file.
  Duration? get clipEnd {
    if (trimEndMs != null) return Duration(milliseconds: trimEndMs!);
    if (durationSec != null) return Duration(seconds: durationSec!);
    return null;
  }

  /// How long the story plays (at most [kStoryDefaultVideoSec] + 1 s);
  /// a still's length when the server did not say.
  Duration get playLength {
    final end = clipEnd;
    if (end == null) return kStoryStillDuration;
    final len = end - clipStart;
    if (len <= Duration.zero) return kStoryStillDuration;
    const cap = Duration(seconds: kStoryDefaultVideoSec + 1);
    return len > cap ? cap : len;
  }
}

@immutable
class Story {
  const Story({
    required this.id,
    required this.author,
    required this.kind,
    required this.overlays,
    required this.audience,
    required this.createdAt,
    required this.expiresAt,
    required this.viewedByMe,
    required this.isMine,
    required this.viewCount,
    required this.canReply,
    this.mediaUrl,
    this.previewUrl,
    this.video,
    this.text,
    this.background,
  });

  final String id;
  final StoryUser author;
  final StoryKind kind;
  final String? mediaUrl;
  final String? previewUrl;
  final StoryVideo? video;
  final String? text;
  final String? background;
  final List<StoryOverlay> overlays;
  final StoryAudience audience;
  final DateTime createdAt;
  final DateTime expiresAt;
  final bool viewedByMe;
  final bool isMine;
  final int viewCount;
  final bool canReply;

  /// How long the story stays on screen before the next one.
  Duration get playLength => kind == StoryKind.video && video != null
      ? video!.playLength
      : kStoryStillDuration;

  Story copyWith({bool? viewedByMe}) => Story(
        id: id,
        author: author,
        kind: kind,
        overlays: overlays,
        audience: audience,
        createdAt: createdAt,
        expiresAt: expiresAt,
        viewedByMe: viewedByMe ?? this.viewedByMe,
        isMine: isMine,
        viewCount: viewCount,
        canReply: canReply,
        mediaUrl: mediaUrl,
        previewUrl: previewUrl,
        video: video,
        text: text,
        background: background,
      );
}

/// One bubble above the feed.
@immutable
class StoryTrayItem {
  const StoryTrayItem({
    required this.user,
    required this.isMe,
    required this.storyCount,
    required this.unseenCount,
    this.latestAt,
  });

  final StoryUser user;
  final bool isMe;
  final int storyCount;
  final int unseenCount;
  final DateTime? latestAt;

  bool get hasStories => storyCount > 0;
  bool get hasUnseen => unseenCount > 0;
}

@immutable
class StoryViewer {
  const StoryViewer({required this.user, required this.viewedAt});

  final StoryUser user;
  final DateTime viewedAt;
}

@immutable
class StorySettings {
  const StorySettings({
    required this.audience,
    required this.allowReplies,
    required this.hiddenCount,
  });

  final StoryAudience audience;
  final bool allowReplies;
  final int hiddenCount;
}

/// Everything the creator collected, handed to the publish job.
@immutable
class StoryDraft {
  const StoryDraft({
    required this.kind,
    required this.audience,
    this.photo,
    this.photoName,
    this.video,
    this.videoDurationMs = 0,
    this.videoSize,
    this.trimStartMs = 0,
    this.text = '',
    this.background = 'gold',
    this.overlays = const [],
  });

  final StoryKind kind;
  final StoryAudience audience;
  final Uint8List? photo;
  final String? photoName;
  final XFile? video;
  final int videoDurationMs;

  /// The picked video's frame size (to decide about compression).
  final ({int width, int height})? videoSize;
  final int trimStartMs;
  final String text;
  final String background;
  final List<StoryOverlay> overlays;
}
