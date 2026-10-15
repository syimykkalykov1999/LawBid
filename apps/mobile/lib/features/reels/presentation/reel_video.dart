import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:video_player/video_player.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// Owner 2026-10-05: the part of the video a reel plays (the author's
/// trim): it starts at [start], loops back at [end], and the progress bar
/// counts only this part.
@immutable
class ReelClip {
  const ReelClip(this.start, this.end);

  /// [total] = the whole file's length, from the player.
  factory ReelClip.of(PostVideo v, Duration total) {
    var start = v.playStart;
    var end = v.playEnd ?? total;
    if (total > Duration.zero && end > total) end = total;
    if (start < Duration.zero || start >= end) start = Duration.zero;
    if (end <= start) end = total;
    return ReelClip(start, end);
  }

  final Duration start;
  final Duration end;

  bool get trimmed => start > Duration.zero;

  /// Back to [start]: past the end, or before the start (a fresh loop).
  bool outside(Duration position) =>
      end > start && (position >= end || position < start);

  /// 0..1 within the clip.
  double progress(Duration position) {
    final len = (end - start).inMilliseconds;
    if (len <= 0) return 0;
    return ((position - start).inMilliseconds / len).clamp(0, 1).toDouble();
  }
}

/// Owner 2026-10-01 — one reel video: the poster frame until the stream is
/// ready, then the video filling its box (cover), looping. Plays only while
/// [active]; an inactive reel or one that leaves the tree frees its player.
class ReelVideo extends StatefulWidget {
  const ReelVideo({
    required this.video,
    required this.active,
    this.muted = true,
    this.paused = false,
    this.warm = false,
    this.onProgress,
    super.key,
  });

  final PostVideo video;
  final bool active;

  /// Owner 2026-10-15: the next/previous reel opens its stream ahead and
  /// waits at the first frame, so swiping to it starts at once.
  final bool warm;
  final bool muted;

  /// The viewer paused it (tap on the reel).
  final bool paused;

  /// 0..1 while playing (the thin bar under a reel).
  final ValueChanged<double>? onProgress;

  @override
  State<ReelVideo> createState() => _ReelVideoState();
}

class _ReelVideoState extends State<ReelVideo> {
  VideoPlayerController? _c;
  bool _ready = false;
  bool _failed = false;
  Duration? _resumeAt;
  ReelClip? _clip;
  bool _seeking = false;

  @override
  void initState() {
    super.initState();
    if (widget.active || widget.warm) _open();
  }

  @override
  void didUpdateWidget(ReelVideo old) {
    super.didUpdateWidget(old);
    // Off screen: free the player so it stops buffering (data + memory);
    // coming back re-opens it at the same spot.
    if (!widget.active && !widget.warm && _c != null) {
      final at = _c!.value.isInitialized ? _c!.value.position : null;
      _close();
      _resumeAt = at;
    }
    // With sound a reel takes the audio focus (other music pauses, like
    // Instagram); muted previews mix with it. The mode is fixed when the
    // player is created, so a mute change re-opens it at the same spot.
    if (widget.muted != old.muted && _c != null) {
      final at = _c!.value.position;
      _close();
      _resumeAt = at;
    }
    if (widget.video.playbackUrl != old.video.playbackUrl) _close();
    if ((widget.active || widget.warm) && _c == null) _open();
    _apply();
  }

  Future<void> _open() async {
    final url = widget.video.playbackUrl;
    if (url == null) return;
    final c = VideoPlayerController.networkUrl(
      Uri.parse(url),
      formatHint: VideoFormat.hls,
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: widget.muted),
    );
    _c = c;
    c.addListener(_tick);
    try {
      await c.initialize();
      await c.setLooping(true);
      final clip = ReelClip.of(widget.video, c.value.duration);
      _clip = clip;
      final at = _resumeAt;
      _resumeAt = null;
      if (at != null && !clip.outside(at)) {
        await c.seekTo(at);
      } else if (clip.trimmed) {
        await c.seekTo(clip.start);
      }
      if (!mounted || _c != c) return;
      setState(() => _ready = true);
      _apply();
    } on Object {
      if (mounted && _c == c) setState(() => _failed = true);
    }
  }

  void _tick() {
    final c = _c;
    final clip = _clip;
    if (c == null || clip == null || !c.value.isInitialized) return;
    final pos = c.value.position;
    // Only the trimmed part plays: past its end (or after the player's own
    // loop to 0) it jumps back to the start.
    if (clip.outside(pos) && !_seeking) {
      _seeking = true;
      c.seekTo(clip.start).whenComplete(() => _seeking = false);
      return;
    }
    widget.onProgress?.call(clip.progress(pos));
  }

  void _apply() {
    final c = _c;
    if (c == null || !_ready) return;
    c.setVolume(widget.muted ? 0 : 1);
    final play = widget.active && !widget.paused;
    if (play && !c.value.isPlaying) {
      c.play();
    } else if (!play && c.value.isPlaying) {
      c.pause();
    }
  }

  void _close() {
    final c = _c;
    _c = null;
    _ready = false;
    _failed = false;
    _clip = null;
    _seeking = false;
    c?.removeListener(_tick);
    c?.dispose();
  }

  @override
  void dispose() {
    _close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final thumb = widget.video.thumbnailUrl;
    final c = _c;
    return ColoredBox(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (thumb != null)
            CachedNetworkImage(
              imageUrl: thumb,
              fit: BoxFit.cover,
              fadeInDuration: Duration.zero,
              errorWidget: (_, __, ___) => const SizedBox.shrink(),
            ),
          if (c != null && _ready)
            FittedBox(
              fit: BoxFit.cover,
              clipBehavior: Clip.hardEdge,
              child: SizedBox(
                width: c.value.size.width,
                height: c.value.size.height,
                child: VideoPlayer(c),
              ),
            ),
          if (widget.active &&
              !_ready &&
              !_failed &&
              widget.video.playbackUrl != null)
            Center(
              child: SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: colors.gold,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// A reel inside a feed card: plays muted while most of it is on screen,
/// with the reel mark and the length in the corner.
class InlineReel extends StatefulWidget {
  const InlineReel({
    required this.post,
    required this.onOpen,
    this.topInset = 0,
    super.key,
  });

  final Post post;
  final VoidCallback onOpen;

  /// Space kept free at the top (an author row lies over the video).
  final double topInset;

  @override
  State<InlineReel> createState() => _InlineReelState();
}

class _InlineReelState extends State<InlineReel> {
  bool _visible = false;
  int _flash = 0;

  Timer? _viewTimer;

  /// Owner 2026-10-12: a reel counts as viewed after a few seconds on
  /// screen (once per viewer; the server dedups).
  void _trackView() {
    _viewTimer?.cancel();
    if (!_visible) return;
    _viewTimer = Timer(const Duration(seconds: 3), () {
      if (!mounted || !_visible) return;
      ProviderScope.containerOf(context)
          .read(socialActionsProvider)
          .recordView(widget.post);
    });
  }

  @override
  void dispose() {
    _viewTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = widget.post.video!;
    return VisibilityDetector(
      key: ValueKey('reel-${widget.post.id}'),
      onVisibilityChanged: (info) {
        final v = info.visibleFraction > 0.6;
        if (v != _visible && mounted) {
          setState(() => _visible = v);
          _trackView();
        }
      },
      child: GestureDetector(
        // Owner 2026-10-13: in the feed a tap on the playing video opens the
        // full-screen player; pause / resume live in the player.
        onTap: widget.onOpen,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Consumer(
              builder: (context, ref, _) => ReelVideo(
                video: video,
                active: _visible && video.ready,
                muted: ref.watch(reelsMutedProvider),
              ),
            ),
            if (!video.ready)
              const Center(
                child: AppIcon(
                  AppIcons.filmReelOutlined,
                  size: 40,
                  color: Colors.white70,
                ),
              ),
            // Instagram: a small speaker in the corner toggles the sound
            // for the whole session; a tap flashes the icon in the middle.
            PositionedDirectional(
              end: AppSpacing.md,
              bottom: AppSpacing.md,
              child: Consumer(
                builder: (context, ref, _) {
                  final muted = ref.watch(reelsMutedProvider);
                  return GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      ref.read(reelsMutedProvider.notifier).toggle();
                      setState(() => _flash++);
                    },
                    child: Container(
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.55),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        muted
                            ? Icons.volume_off_rounded
                            : Icons.volume_up_rounded,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                  );
                },
              ),
            ),
            if (_flash > 0)
              Center(
                child: IgnorePointer(
                  child: Consumer(
                    builder: (context, ref, _) {
                      final muted = ref.watch(reelsMutedProvider);
                      return TweenAnimationBuilder<double>(
                        key: ValueKey(_flash),
                        tween: Tween(begin: 1, end: 0),
                        duration: const Duration(milliseconds: 900),
                        curve: Curves.easeIn,
                        builder: (_, v, child) =>
                            Opacity(opacity: v, child: child),
                        child: Container(
                          width: 56,
                          height: 56,
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.5),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            muted
                                ? Icons.volume_off_rounded
                                : Icons.volume_up_rounded,
                            size: 28,
                            color: Colors.white,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String formatReelDuration(int sec) =>
    '${sec ~/ 60}:${(sec % 60).toString().padLeft(2, '0')}';
