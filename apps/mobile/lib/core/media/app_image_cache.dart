import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:lawbid/core/network/http_transport.dart';

/// Caching round 2 (S2-11): counts every picture the caches download (each
/// one is a write to the phone's disk) and, after every
/// `AppImageCaches.writesPerTrim` of them, asks for a trim — so a handful of
/// large photos cannot take the phone past the admin's MB ceiling between
/// the start-of-app and daily trims (`CacheMaintenance.enforce`).
class CountingFileService extends FileService {
  CountingFileService(this._onGet, {FileService? inner})
      : _inner = inner ?? HttpFileService();

  final void Function() _onGet;
  final FileService _inner;

  @override
  Future<FileServiceResponse> get(
    String url, {
    Map<String, String>? headers,
  }) {
    _onGet();
    return _inner.get(url, headers: headers);
  }
}

/// Owner 2026-10-22 (load audit finding 8): the phone's picture caches.
/// flutter_cache_manager's default keeps only 200 files, so scrolling the
/// feed downloaded the same pictures again. Two caches, so chat photos do
/// not push feed pictures and avatars out (and the other way round).
///
/// Owner 2026-10-22 (client economy plan §5, Telegram «Данные и память»):
/// the chat media cache keeps files for «Хранить медиа» (3 days / 1 week /
/// 1 month / always, [configure]); the byte limits of both caches are
/// kept by `MediaCacheDir` (core/cache), which trims the oldest files.
/// Media keys are unique and immutable on the CDN (package I), so a file
/// on the phone is never re-validated while it is kept.
abstract final class AppImageCaches {
  /// S8-1: picture downloads ride the native stack (HTTP/2+3 to the CDN)
  /// when there is one; without one it is the package's own client.
  static FileService _fileService() {
    final client = HttpTransport.nativeClient();
    return HttpFileService(httpClient: client);
  }

  static const feedKey = 'lawbid_images';
  static const chatMediaKey = 'lawbid_chat_media';

  /// Downloads between two byte trims.
  static const writesPerTrim = 40;

  /// Called (at most once per [writesPerTrim] downloads) when it is time to
  /// trim; set by the app's cache enforcer, null in tests.
  static void Function()? onWriteBurst;
  static int _writes = 0;

  /// One more picture is being written; fires [onWriteBurst] every
  /// [writesPerTrim]. Public for tests.
  static void noteWrite() {
    _writes++;
    if (_writes < writesPerTrim) return;
    _writes = 0;
    onWriteBurst?.call();
  }

  /// Feed pictures, avatars, stories, reels thumbnails.
  static final CacheManager feed = CacheManager(
    Config(
      feedKey,
      stalePeriod: const Duration(days: 7),
      maxNrOfCacheObjects: 2000,
      fileService: CountingFileService(noteWrite, inner: _fileService()),
    ),
  );

  static int _keepChatMediaDays = 30;
  static CacheManager? _chatMedia;

  /// Photos, video previews and files of chats.
  static CacheManager get chatMedia => _chatMedia ??= _buildChatMedia();

  /// How many days chat media stays on the phone (0 = always).
  static int get keepChatMediaDays => _keepChatMediaDays;

  /// «Хранить медиа чатов» changed: the next lookups use the new period
  /// (the old manager finishes what it was serving).
  static void configure({required int keepChatMediaDays}) {
    if (keepChatMediaDays == _keepChatMediaDays) return;
    _keepChatMediaDays = keepChatMediaDays;
    // Rebuilt on the next lookup (never built here: a test has no disk).
    _chatMedia = null;
  }

  static CacheManager _buildChatMedia() => CacheManager(
        Config(
          chatMediaKey,
          stalePeriod: _keepChatMediaDays <= 0
              ? const Duration(days: 3650)
              : Duration(days: _keepChatMediaDays),
          maxNrOfCacheObjects: 1000,
          fileService: CountingFileService(noteWrite, inner: _fileService()),
        ),
      );
}
