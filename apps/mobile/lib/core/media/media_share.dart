import 'dart:io';
import 'dart:ui' show Rect;

import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:lawbid/core/files/resumable_download.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/media/stable_network_image.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Tests answer here instead of the system share sheet.
@visibleForTesting
Future<bool> Function(String url, String mime)? debugShareMedia;

/// The viewer offers «Поделиться» (phones only: the browser keeps «Скачать»,
/// like Telegram Web).
bool get canShareMedia => kIsWeb == false || debugShareMedia != null;

/// Row 110 (WhatsApp / Telegram viewer «Share», iOS Photos share): the
/// system share sheet with the shown photo or video as a file.
///
/// A photo is the file the viewer already holds (the image cache, no second
/// request). A video is your own file still on the phone, else it is
/// fetched once into the temporary folder (ResumableDownload: resumes a cut
/// transfer). Returns false when it could not be shared.
Future<bool> shareMedia({
  required String url,
  required String mime,
  File? file,
  Rect? origin,
}) async {
  final debug = debugShareMedia;
  if (debug != null) return debug(url, mime);
  if (kIsWeb) return false;
  try {
    final File local;
    if (file != null && file.existsSync()) {
      local = file;
    } else if (mime.startsWith('image/')) {
      final key = stableImageCacheKey(url) ?? url;
      final cache = AppImageCaches.feed;
      local = (await cache.getFileFromCache(key))?.file ??
          await cache.getSingleFile(url, key: key);
    } else {
      final dir = await getTemporaryDirectory();
      final ext = mime.split('/').last;
      final target = File(
        '${dir.path}/lawbid-share-${(stableImageCacheKey(url) ?? url).hashCode}.$ext',
      );
      local = target.existsSync()
          ? target
          : await ResumableDownload.instance.fetch(url, target);
    }
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(local.path, mimeType: mime)],
        sharePositionOrigin: origin,
      ),
    );
    return true;
  } on Object {
    return false;
  }
}
