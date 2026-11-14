import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/media/stable_network_image.dart';
import 'package:lawbid/features/chat/data/chat_video_frames.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:path_provider/path_provider.dart';

/// Owner row 106 (media audit 13.11, batch F item 12; Telegram / WhatsApp):
/// a photo or video you just sent is never downloaded back. Once the server
/// has the message, the file the queue sent becomes the phone's cached copy
/// of it, as `adoptVoiceFileAsCache` already does for voice notes:
/// - a photo goes into the chat picture cache under the key the bubble and
///   the viewer read ([stableImageCacheKey] of the server link);
/// - a video is kept as the local copy of that file id (the player opens
///   it from disk) and its first frame becomes the tile's picture.
///
/// Best effort: anything missing just downloads as before. Nothing on the
/// web (the browser keeps its own cache).
Future<void> adoptSentChatMedia(ChatAttachment? a, String? path) async {
  if (kIsWeb || a == null || path == null || a.fileId.isEmpty) return;
  final file = File(path);
  try {
    if (!file.existsSync()) return;
    if (a.isVideo) {
      final target = await ownChatVideoPath(a.fileId);
      if (target == null) return;
      await ChatVideoFrames.instance.load(a.fileId, path);
      try {
        await file.rename(target);
      } on FileSystemException {
        // Another volume: copy (the queue removes its own file).
        await file.copy(target);
      }
      return;
    }
    final url = a.url;
    if (!a.isImage || url == null) return;
    final ext = a.extension.isEmpty ? 'jpg' : a.extension;
    await AppImageCaches.chatMedia.putFile(
      url,
      await file.readAsBytes(),
      key: stableImageCacheKey(url) ?? url,
      maxAge: Duration(days: AppImageCaches.keepChatMediaDays),
      fileExtension: ext,
    );
  } on Object catch (e) {
    debugPrint('sent media not kept: $e');
  }
}

/// Where your own sent chat video [fileId] is kept (null on the web).
Future<String?> ownChatVideoPath(String fileId) async {
  if (kIsWeb) return null;
  final dir = await getTemporaryDirectory();
  return '${dir.path}/chat_video_$fileId.mp4';
}

/// Your own copy of chat video [fileId] when the phone still has it.
Future<File?> ownChatVideo(String fileId) async {
  try {
    final p = await ownChatVideoPath(fileId);
    if (p == null) return null;
    final f = File(p);
    return f.existsSync() && f.lengthSync() > 0 ? f : null;
  } on Object {
    return null;
  }
}
