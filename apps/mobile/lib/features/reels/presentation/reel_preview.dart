import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:video_player/video_player.dart';

/// The picked video in the reel composer: its length and size, and a
/// muted, looping preview.
abstract class ReelPreview {
  int get durationMs;
  Size get size;
  bool get playing;

  /// Fires when [playing] changes.
  Listenable get changes;

  Widget view();
  Future<void> play();
  Future<void> pause();

  /// Shows the frame at [ms] (the chosen cover).
  Future<void> seekTo(int ms);
  Future<void> dispose();
}

/// Opens a picked video; null = it cannot be played.
typedef ReelPreviewLoader = Future<ReelPreview?> Function(XFile file);

final reelPreviewLoaderProvider =
    Provider<ReelPreviewLoader>((ref) => VideoPlayerReelPreview.load);

class VideoPlayerReelPreview implements ReelPreview {
  VideoPlayerReelPreview._(this._c);

  final VideoPlayerController _c;

  static Future<ReelPreview?> load(XFile file) async {
    // In the browser the picked video is a blob: URL, played as a network
    // source (video_player_web has no files).
    final c = kIsWeb
        ? VideoPlayerController.networkUrl(Uri.parse(file.path))
        : VideoPlayerController.file(File(file.path));
    try {
      await c.initialize();
      await c.setLooping(true);
      await c.setVolume(0);
    } on Object {
      await c.dispose();
      return null;
    }
    return VideoPlayerReelPreview._(c);
  }

  @override
  int get durationMs => _c.value.duration.inMilliseconds;

  @override
  Size get size => _c.value.size;

  @override
  bool get playing => _c.value.isPlaying;

  @override
  Listenable get changes => _c;

  @override
  Widget view() => FittedBox(
        fit: BoxFit.cover,
        clipBehavior: Clip.hardEdge,
        child: SizedBox(
          width: _c.value.size.width,
          height: _c.value.size.height,
          child: VideoPlayer(_c),
        ),
      );

  @override
  Future<void> play() => _c.play();

  @override
  Future<void> pause() => _c.pause();

  @override
  Future<void> seekTo(int ms) => _c.seekTo(Duration(milliseconds: ms));

  @override
  Future<void> dispose() => _c.dispose();
}
