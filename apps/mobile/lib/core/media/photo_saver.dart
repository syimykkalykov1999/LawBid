import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:gal/gal.dart';
import 'package:lawbid/core/files/browser_download.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/media/stable_network_image.dart';

/// How saving a photo ended, for the message the person sees.
enum PhotoSaveResult { saved, noAccess, failed }

/// Tests answer here instead of the gallery.
@visibleForTesting
Future<PhotoSaveResult> Function(String url)? debugSavePhoto;

/// Owner 2026-11-05: «Скачать» in the photo viewer. The phone's gallery gets
/// the picture the viewer already holds (the image cache, under the file and
/// not the link, so no second request); the browser downloads it.
Future<PhotoSaveResult> savePhoto(String url) async {
  final debug = debugSavePhoto;
  if (debug != null) return debug(url);
  try {
    if (kIsWeb) {
      await downloadInBrowser(url, name: _browserName(url));
      return PhotoSaveResult.saved;
    }
    final key = stableImageCacheKey(url) ?? url;
    final cache = AppImageCaches.feed;
    final file = (await cache.getFileFromCache(key))?.file ??
        await cache.getSingleFile(url, key: key);
    await Gal.putImageBytes(
      await file.readAsBytes(),
      name: 'lawbid-${DateTime.now().millisecondsSinceEpoch}',
    );
    return PhotoSaveResult.saved;
  } on GalException catch (e) {
    return e.type == GalExceptionType.accessDenied
        ? PhotoSaveResult.noAccess
        : PhotoSaveResult.failed;
  } on Object {
    return PhotoSaveResult.failed;
  }
}

String _browserName(String url) {
  final segments = Uri.tryParse(url)?.pathSegments ?? const <String>[];
  final last = segments.isEmpty ? '' : segments.last;
  return last.contains('.') ? last : 'lawbid-photo.jpg';
}
