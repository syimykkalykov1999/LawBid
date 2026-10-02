import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:video_player/video_player.dart';
import 'package:visibility_detector/visibility_detector.dart';

/// Owner 2026-10-01 — one reel video: the poster frame until the stream is
/// ready, then the video filling its box (cover), looping. Plays only while
/// [active]; a widget that leaves the tree frees its player.
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

  @override
  void initState() {
    super.initState();
    if (widget.active) _open();
  }

  @override
  void didUpdateWidget(ReelVideo old) {
    super.didUpdateWidget(old);
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
      videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true),
    );
    _c = c;
    c.addListener(_tick);
    try {
      await c.initialize();
      await c.setLooping(true);
      if (!mounted || _c != c) return;
      setState(() => _ready = true);
      _apply();
    } on Object {
      if (mounted && _c == c) setState(() => _failed = true);
    }
  }

  void _tick() {
    final c = _c;
    final cb = widget.onProgress;
    if (c == null || cb == null || !c.value.isInitialized) return;
    final total = c.value.duration.inMilliseconds;
    if (total > 0) cb(c.value.position.inMilliseconds / total);
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
            Positioned(
              top: AppSpacing.md,
              right: AppSpacing.md,
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
