import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/media/app_image_cache.dart';

/// The first frame of one chat video and its length.
@immutable
class ChatVideoFrame {
  const ChatVideoFrame(this.jpeg, this.length);

  final Uint8List jpeg;

  /// Zero when the phone could not tell.
  final Duration length;
}

/// Owner row 106 (media audit 13.11, batch F item 13; WhatsApp / Telegram):
/// a chat video tile shows a picture — the video's own first frame — and
/// opens a player only when it is tapped. Before, every tile on screen
/// opened its own video decoder just to show that frame.
///
/// The frame is made once per video by the phone itself (Android
/// MediaMetadataRetriever, iOS AVAssetImageGenerator: channel
/// `lawbid/video_frame`, android/.../VideoFrameChannel.kt and
/// ios/Runner/AppDelegate.swift) from the video's link or, for your own
/// video, from the file you sent; it is kept in the chat picture cache, so
/// scrolling back, reopening the chat or restarting the app never asks the
/// network for it again. Null where it cannot be made (the browser, an
/// unreadable video): the tile then opens its player as before.
class ChatVideoFrames {
  ChatVideoFrames({
    MethodChannel? channel,
    bool? supported,
    BaseCacheManager Function()? cache,
  })  : _channel = channel ?? const MethodChannel('lawbid/video_frame'),
        _supported = supported ?? !kIsWeb,
        _cache = cache ?? (() => AppImageCaches.chatMedia);

  static ChatVideoFrames instance = ChatVideoFrames();

  final MethodChannel _channel;
  final bool _supported;

  /// The chat picture cache (its age and size rules apply to the frames).
  final BaseCacheManager Function() _cache;
  final _inFlight = <String, Future<ChatVideoFrame?>>{};

  static String _frameKey(String fileId) => 'chat-video-frame:$fileId';
  static String _lengthKey(String fileId) => 'chat-video-length:$fileId';

  /// The kept frame of [fileId], without making one.
  Future<ChatVideoFrame?> cached(String fileId) async {
    if (!_supported || fileId.isEmpty) return null;
    try {
      final cache = _cache();
      final frame = await cache.getFileFromCache(_frameKey(fileId));
      if (frame == null) return null;
      final jpeg = await frame.file.readAsBytes();
      if (jpeg.isEmpty) return null;
      final len = await cache.getFileFromCache(_lengthKey(fileId));
      final ms = len == null
          ? 0
          : int.tryParse(utf8.decode(await len.file.readAsBytes())) ?? 0;
      return ChatVideoFrame(jpeg, Duration(milliseconds: ms));
    } on Object {
      return null;
    }
  }

  /// The frame of [fileId]: kept, else made from [source] (the video's link
  /// or a file path) and kept. Two tiles of one video share one making.
  Future<ChatVideoFrame?> load(String fileId, String source) {
    if (!_supported || fileId.isEmpty) return Future.value();
    return _inFlight[fileId] ??= () async {
      try {
        return await cached(fileId) ?? await _make(fileId, source);
      } finally {
        unawaited(_inFlight.remove(fileId));
      }
    }();
  }

  Future<ChatVideoFrame?> _make(String fileId, String source) async {
    final frame = await _frame(source);
    if (frame != null) await put(fileId, frame.jpeg, length: frame.length);
    return frame;
  }

  /// The phone's own first frame of [source] (a link or a path), not kept.
  Future<ChatVideoFrame?> _frame(String source) async {
    try {
      final out = await _channel.invokeMapMethod<String, Object?>('frame', {
        'url': source,
        // The admin's chat photo size and quality (`media.chat_photo_*`).
        'maxPx': ClientTuning.chatPhotoMaxPx.round(),
        'quality': ClientTuning.chatPhotoQuality,
      });
      final jpeg = out?['jpeg'];
      if (jpeg is! Uint8List || jpeg.isEmpty) return null;
      final ms = (out?['durationMs'] as num?)?.toInt() ?? 0;
      return ChatVideoFrame(jpeg, Duration(milliseconds: ms));
    } on Object {
      // No channel (tests, an old build), no network or a broken video.
      return null;
    }
  }

  /// Picked videos' first frames by path, while the app runs.
  final _byPath = <String, Future<ChatVideoFrame?>>{};

  /// The most picked videos whose frames are remembered.
  static const keptPicked = 64;

  /// Owner 27.11 (WhatsApp / Telegram: a picked video shows its own picture
  /// at once): the first frame of a video on this phone that has no file id
  /// yet — the media preview, its strip and the sending bubble ask for the
  /// same path and share one making. Kept in memory only; once the video is
  /// sent its frame goes under its file id (`adoptSentChatMedia`).
  Future<ChatVideoFrame?> ofFile(String path) {
    if (!_supported || path.isEmpty) return Future.value();
    final known = _byPath[path];
    if (known != null) return known;
    while (_byPath.length >= keptPicked) {
      _byPath.remove(_byPath.keys.first);
    }
    final made = _frame(path);
    _byPath[path] = made;
    unawaited(
      made.then((f) {
        // Not made (an unreadable file): asked again next time.
        if (f == null) _byPath.remove(path);
      }),
    );
    return made;
  }

  /// Keeps [jpeg] as the frame of [fileId] (and its [length]).
  Future<void> put(String fileId, Uint8List jpeg, {Duration? length}) async {
    if (!_supported || fileId.isEmpty) return;
    try {
      final cache = _cache();
      final keep = Duration(days: AppImageCaches.keepChatMediaDays);
      await cache.putFile(
        _frameKey(fileId),
        jpeg,
        key: _frameKey(fileId),
        maxAge: keep,
        fileExtension: 'jpg',
      );
      if (length != null && length > Duration.zero) {
        await cache.putFile(
          _lengthKey(fileId),
          utf8.encode('${length.inMilliseconds}'),
          key: _lengthKey(fileId),
          maxAge: keep,
          fileExtension: 'txt',
        );
      }
    } on Object {
      // Made again next time.
    }
  }
}
