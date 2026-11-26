import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:path_provider/path_provider.dart';

/// S13 #26 (MASVS-STORAGE-1): the chat media cache (photos, video previews,
/// files of chats under `<tmp>/lawbid_chat_media`, voice notes
/// `<tmp>/voice_cache_*.m4a`) gets the iOS Data Protection class
/// `completeUntilFirstUserAuthentication` explicitly: encrypted with a key
/// the phone only has after the first unlock since a reboot, so the files
/// are unreadable from a phone that has not been unlocked. New files take
/// the class of their folder; files already there are set too. iOS only
/// (Android encrypts app storage per user itself; the web keeps media in the
/// browser). Never throws.
abstract final class FileProtection {
  static const MethodChannel _channel = MethodChannel('lawbid/file_protection');

  /// The voice note files that sit next to the folder.
  static const voicePrefix = 'voice_cache_';

  static bool get _supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  /// Sets the class on the chat media folder (made if missing) and on what
  /// is in it. Answers how many items were set (0 elsewhere).
  static Future<int> protectChatMedia({
    Future<String> Function()? temporaryDirectory,
  }) async {
    if (!_supported) return 0;
    try {
      final tmp = await (temporaryDirectory ??
          () async => (await getTemporaryDirectory()).path)();
      final count = await _channel.invokeMethod<int>('protect', {
        'dir': '$tmp/${AppImageCaches.chatMediaKey}',
        'prefix': voicePrefix,
      });
      return count ?? 0;
    } on Object catch (e) {
      debugPrint('file protection: $e');
      return 0;
    }
  }
}
