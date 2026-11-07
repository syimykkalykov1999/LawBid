import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/chat_media_index.dart';
import 'package:lawbid/core/media/app_image_cache.dart';

/// Owner 2026-11-02: chat → its pictures on the phone (reads the picture
/// cache's own files for sizes, deletes from it for «Очистить» of one chat).
final chatMediaIndexProvider = Provider<ChatMediaIndex>((ref) {
  return ChatMediaIndex(
    ref.watch(cacheDatabaseProvider),
    sizeOf: (key) async {
      try {
        final info = await AppImageCaches.chatMedia.getFileFromCache(key);
        return info == null ? null : await info.file.length();
      } on Object {
        return null;
      }
    },
    fileOf: (key) async {
      try {
        return (await AppImageCaches.chatMedia.getFileFromCache(key))?.file;
      } on Object {
        return null;
      }
    },
    remove: (key) async {
      try {
        await AppImageCaches.chatMedia.removeFile(key);
      } on Object {
        // Already gone.
      }
    },
  );
});
