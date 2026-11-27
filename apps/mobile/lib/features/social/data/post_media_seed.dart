import 'package:flutter/foundation.dart';
import 'package:lawbid/core/files/file_types.dart' show sniffImageMime;
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 26.11 (Instagram / WhatsApp: your own just-published photo is never
/// downloaded back, so the live post replaces the «Publishing…» card without
/// a flash): the photos the phone just sent become the feed's cached copy of
/// the published post, under the keys the post card, its blurred backdrop
/// and the profile grid tile read (`<fileId>:1080`, `<fileId>:320`, see
/// post_card.dart / post_grid_tile.dart / post_prefetch.dart). The same
/// pattern as `adoptSentChatMedia` (chat_media_seed.dart) for chat photos.
///
/// [photos] are in the order of [post]'s media (the order they were sent).
/// Best effort: anything missing just downloads as before. Nothing on the
/// web (the browser keeps its own cache).
Future<void> adoptPublishedPostPhotos(
  Post post,
  List<Uint8List?> photos,
) async {
  if (kIsWeb) return;
  final media = post.media;
  for (var i = 0; i < media.length && i < photos.length; i++) {
    final bytes = photos[i];
    if (bytes == null || bytes.isEmpty) continue;
    final m = media[i];
    final ext = switch (sniffImageMime(bytes)) {
      'image/png' => 'png',
      'image/webp' => 'webp',
      'image/heic' => 'heic',
      _ => 'jpg',
    };
    try {
      for (final (url, key) in [
        (m.mediumUrl, '${m.fileId}:1080'),
        (m.previewUrl, '${m.fileId}:320'),
      ]) {
        await AppImageCaches.feed.putFile(
          url,
          bytes,
          key: key,
          maxAge: const Duration(days: 7),
          fileExtension: ext,
        );
      }
    } on Object catch (e) {
      debugPrint('published photo not kept: $e');
    }
  }
}
