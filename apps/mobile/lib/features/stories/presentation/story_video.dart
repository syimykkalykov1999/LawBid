import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb, visibleForTesting;
import 'package:flutter/material.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:video_player/video_player.dart';

/// Tests: makes the player instead of the network one.
@visibleForTesting
VideoPlayerController Function(Uri url)? debugStoryPlayerFactory;

/// The player of one video story: plays the part the author chose
/// ([StoryVideo.clipStart]..clipEnd), reports 0..1 through [onProgress],
/// calls [onEnded] once at the end and [onFailed] when it cannot play.
/// It plays only while not [paused]; a new [restart] value starts over.
class StoryVideoPlayer extends StatefulWidget {
  const StoryVideoPlayer({
    required this.video,
    required this.paused,
    required this.onProgress,
    required this.onEnded,
    required this.onFailed,
    this.restart = 0,
    super.key,
  });

  final StoryVideo video;
  final bool paused;
  final int restart;
  final ValueChanged<double> onProgress;
  final VoidCallback onEnded;
  final VoidCallback onFailed;

  @override
  State<StoryVideoPlayer> createState() => _StoryVideoPlayerState();
}

class _StoryVideoPlayerState extends State<StoryVideoPlayer> {
  VideoPlayerController? _c;
  bool _ready = false;
  bool _ended = false;
  Duration _start = Duration.zero;
  Duration _end = Duration.zero;

  @override
  void initState() {
    super.initState();
    unawaited(_open());
  }

  Future<void> _open() async {
    final url = widget.video.urlFor(web: kIsWeb);
    if (url == null) {
      widget.onFailed();
      return;
    }
    final uri = Uri.parse(url);
    final c = debugStoryPlayerFactory?.call(uri) ??
        VideoPlayerController.networkUrl(uri);
    try {
      await c.initialize();
      // A browser lets a page play with sound only after a tap; the story
      // plays muted there rather than not at all.
      await c.setVolume(kIsWeb ? 0 : 1);
    } on Object {
      await c.dispose();
      if (mounted) widget.onFailed();
      return;
    }
    if (!mounted) {
      await c.dispose();
      return;
    }
    final total = c.value.duration;
    _start = widget.video.clipStart;
    var end = widget.video.clipEnd ?? total;
    if (total > Duration.zero && end > total) end = total;
    if (_start >= end) _start = Duration.zero;
    _end = end;
    c.addListener(_tick);
    setState(() {
      _c = c;
      _ready = true;
    });
    await c.seekTo(_start);
    if (!widget.paused && mounted) await c.play();
  }

  void _tick() {
    final c = _c;
    if (c == null || !mounted) return;
    final v = c.value;
    if (v.hasError) {
      c.removeListener(_tick);
      widget.onFailed();
      return;
    }
    final len = (_end - _start).inMilliseconds;
    if (len <= 0) return;
    final pos = v.position;
    widget.onProgress(
      ((pos - _start).inMilliseconds / len).clamp(0, 1).toDouble(),
    );
    if (!_ended && (pos >= _end || (v.isCompleted && pos > _start))) {
      _ended = true;
      unawaited(c.pause());
      widget.onEnded();
    }
  }

  @override
  void didUpdateWidget(StoryVideoPlayer old) {
    super.didUpdateWidget(old);
    final c = _c;
    if (c == null || !_ready) return;
    if (widget.restart != old.restart) {
      _ended = false;
      unawaited(
        c.seekTo(_start).then((_) {
          if (mounted && !widget.paused) return c.play();
          return null;
        }),
      );
    } else if (widget.paused != old.paused) {
      unawaited(widget.paused ? c.pause() : c.play());
    }
  }

  @override
  void dispose() {
    final c = _c;
    c?.removeListener(_tick);
    unawaited(c?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = _c;
    if (c == null || !_ready) return const SizedBox.expand();
    final size = c.value.size;
    return FittedBox(
      child: SizedBox(
        width: size.width <= 0 ? 1 : size.width,
        height: size.height <= 0 ? 1 : size.height,
        child: VideoPlayer(c),
      ),
    );
  }
}
