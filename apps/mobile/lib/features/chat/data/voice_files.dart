import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:lawbid/core/files/resumable_download.dart';
import 'package:path_provider/path_provider.dart';

Future<void> deleteVoiceFile(String? path) async {
  // Web: the blob lives until the tab closes.
  if (path == null || kIsWeb) return;
  try {
    await File(path).delete();
  } on Object {
    // Already gone.
  }
}

/// Where a downloaded (or own, just sent) note is kept on the phone, named
/// by the server's message id so playing it never touches the network.
Future<String?> voiceCachePath(String messageId) async {
  if (kIsWeb) return null;
  final dir = await getTemporaryDirectory();
  return '${dir.path}/voice_cache_$messageId.m4a';
}

/// Owner 2026-10-15: your own note played slowly (it was downloaded again
/// right after being sent). Once the server has it, the recording becomes
/// the cached copy of that message — playback starts from the file at once.
Future<void> adoptVoiceFileAsCache(String? path, String messageId) async {
  if (path == null || kIsWeb) return;
  try {
    final target = await voiceCachePath(messageId);
    if (target == null) return;
    final file = File(path);
    if (!file.existsSync()) return;
    await file.copy(target);
    await file.delete();
  } on Object {
    // The note just downloads when it is played.
  }
}

/// Owner 2026-11-08 (speed everywhere, SPEED_MATRIX §3 №10): a note not on
/// the phone yet is downloaded with the same [ResumableDownload] as a case
/// file — a cut connection keeps the bytes in `.part` and the next try asks
/// the storage for the rest (`Range: bytes=N-`) instead of starting over;
/// two taps share one transfer. Returns the kept file's path, or null when
/// there is no link, no cache directory (web) or the download failed.
Future<String?> downloadVoiceNote(String messageId, String? url) async {
  if (url == null) return null;
  final target = await voiceCachePath(messageId);
  if (target == null) return null;
  final file = File(target);
  // ignore: avoid_slow_async_io
  if (await file.exists() && await file.length() > 0) return file.path;
  final got = await ResumableDownload.instance.fetch(url, file);
  return got.lengthSync() > 0 ? got.path : null;
}
