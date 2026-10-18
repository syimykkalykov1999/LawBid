import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/widgets.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-15: photos should appear as fast as videos — while a post
/// is on screen the pictures of the next ones are already downloaded (disk
/// cache) and decoded at the size the card draws (memory cache), so they
/// are there before the finger gets to them.
final _warmed = <String>{};

void prefetchPost(BuildContext context, Post p) {
  if (!_warmed.add(p.id)) return;
  if (_warmed.length > 400) _warmed.clear();
  void warm(String url, String key, int? width) {
    final provider = CachedNetworkImageProvider(url, cacheKey: key);
    // Same wrapping as CachedNetworkImage(memCacheWidth) so the decoded
    // image is found in the memory cache, not just on disk.
    precacheImage(
      ResizeImage.resizeIfNeeded(width, null, provider),
      context,
      onError: (_, __) {},
    );
  }

  final first = p.media.firstOrNull;
  if (first != null) {
    warm(first.previewUrl, '${first.fileId}:320', 96);
    warm(first.mediumUrl, '${first.fileId}:1080', 1080);
  }
  // Owner 2026-10-18 (speed): the poster and the avatar are warmed with
  // the same cache keys and decode widths their widgets draw them at
  // (ReelVideo: 720 px; the card's author avatar: AppAvatar's size × the
  // screen's pixel ratio), so the warm decode is the one found on screen.
  final thumb = p.video?.thumbnailUrl;
  if (thumb != null) {
    precacheImage(reelPosterProvider(thumb), context, onError: (_, __) {});
  }
  final avatar = p.author.avatarUrl;
  if (avatar != null) {
    // The feed card's author row: a 32 dp IdentityAvatar; the gold ring
    // (verified) takes 4 dp of it (GoldRingAvatar).
    final size =
        p.author.verified ? _kFeedAvatar - _kAvatarRing : _kFeedAvatar;
    warm(
      avatar,
      Uri.parse(avatar).path,
      (size * MediaQuery.devicePixelRatioOf(context)).round(),
    );
  }
}

/// The feed card's author avatar (AuthorHeader avatarSize in _AuthorRow).
const double _kFeedAvatar = 32;

/// GoldRingAvatar's ring around a verified author's photo.
const double _kAvatarRing = 4;
