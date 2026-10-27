import 'dart:io';

import 'package:flutter/foundation.dart';
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
