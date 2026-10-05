import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
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
    this.onProgress,
    super.key,
  });

  final PostVideo video;
  final bool active;
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
    if (widget.active) _open();
  }

  @override
  void didUpdateWidget(ReelVideo old) {
    super.didUpdateWidget(old);
    // Off screen: free the player so it stops buffering (data + memory);
    // coming back re-opens it at the same spot.
    if (!widget.active && _c != null) {
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
    if (widget.active && _c == null) _open();
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
  const InlineReel({required this.post, required this.onOpen, super.key});

  final Post post;
  final VoidCallback onOpen;

  @override
  State<InlineReel> createState() => _InlineReelState();
}

class _InlineReelState extends State<InlineReel> {
  bool _visible = false;

  @override
  Widget build(BuildContext context) {
    final video = widget.post.video!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final d = video.durationSec;
    return VisibilityDetector(
      key: ValueKey('reel-${widget.post.id}'),
      onVisibilityChanged: (info) {
        final v = info.visibleFraction > 0.6;
        if (v != _visible && mounted) setState(() => _visible = v);
      },
      child: GestureDetector(
        onTap: widget.onOpen,
        child: Stack(
          fit: StackFit.expand,
          children: [
            ReelVideo(video: video, active: _visible && video.ready),
            if (!video.ready)
              const Center(
                child: AppIcon(
                  AppIcons.filmReelOutlined,
                  size: 40,
                  color: Colors.white70,
                ),
              ),
            PositionedDirectional(
              top: AppSpacing.md,
              end: AppSpacing.md,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.45),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const AppIcon(
                      AppIcons.filmReelRounded,
                      size: 14,
                      color: Colors.white,
                    ),
                    if (d != null) ...[
                      const SizedBox(width: 4),
                      Text(
                        formatReelDuration(d),
                        style: type.caption.copyWith(color: Colors.white),
                      ),
                    ],
                  ],
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
