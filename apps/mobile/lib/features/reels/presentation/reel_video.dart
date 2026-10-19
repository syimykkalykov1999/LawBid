import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/buttons/player_round_button.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/design_system/widgets/display/pinch_to_zoom.dart';
import 'package:lawbid/core/media/playback_visibility.dart';
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

/// Owner 2026-10-18 (speed): the width a reel's poster frame is decoded
/// at (the player box is at most a phone screen wide).
const int kReelPosterDecodeWidth = 720;

/// The poster frame exactly as [ReelVideo] draws it (cache key + decode
/// size), for warming it before it is on screen.
ImageProvider reelPosterProvider(String url) => ResizeImage.resizeIfNeeded(
      kReelPosterDecodeWidth,
      null,
      CachedNetworkImageProvider(url, cacheKey: stableImageCacheKey(url)),
    );

/// Tests: makes the player instead of the network one.
@visibleForTesting
VideoPlayerController Function(Uri url, VideoPlayerOptions options)?
    debugReelPlayerFactory;

/// Owner 2026-10-01 — one reel video filling its box (cover), looping.
/// Plays only while [active] and on screen (its tab, its route, the app in
/// the foreground — [PlaybackVisibility]); an inactive reel or one that
/// leaves the tree frees its player.
///
/// Owner 2026-10-18 (Instagram): no cover flash — the author's cover (often
/// another frame, or a picture from the gallery) is not drawn before the
/// video; the box stays [backdrop] until the video's first frame covers
/// it. The cover shows only when there is no video to play (still
/// processing, or it failed).
class ReelVideo extends StatefulWidget {
  const ReelVideo({
    required this.video,
    required this.active,
    this.muted = true,
    this.paused = false,
    this.warm = false,
    this.backdrop = true,
    this.zoomable = false,
    this.onProgress,
    super.key,
  });

  /// Owner 2026-10-19 (Instagram): two fingers lift the video over the
  /// screen and zoom it; letting go glides it back (feed, reels).
  final bool zoomable;

  final PostVideo video;
  final bool active;

  /// Black under the video (feed, reels). False: nothing — a grid tile's
  /// own cover stays visible until the first frame is really drawn.
  final bool backdrop;

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

class _ReelVideoState extends State<ReelVideo> with PlaybackVisibility {
  VideoPlayerController? _c;
  bool _ready = false;
  bool _failed = false;

  /// Without a [ReelVideo.backdrop]: the video has moved past the spot it
  /// opened at, so its frames are on screen (until then the tile's cover).
  bool _rendered = false;
  Duration _openedAt = Duration.zero;

  /// Owner 2026-10-15: no loading wheel flashing for a split second — it
  /// shows only when the stream is really slow (over 1.2 s), the poster
  /// frame fills the box until then.
  bool _slow = false;
  Timer? _slowTimer;
  Duration? _resumeAt;
  ReelClip? _clip;
  bool _seeking = false;

  /// Owner 2026-10-19 (the click at the start / end): the sound never jumps
  /// between silence and full volume — it rises over ~100 ms when a reel
  /// starts or loops, and falls over ~80 ms before a pause, the loop's jump
  /// back and the player's close (a hard cut is heard as a click).
  double _vol = 0;
  Timer? _ramp;
  Duration _lastPos = Duration.zero;
  bool _endFaded = false;

  double get _target =>
      widget.active && !widget.paused && playbackVisible && !widget.muted
          ? 1
          : 0;

  void _fade(
    VideoPlayerController c,
    double to, {
    Duration over = const Duration(milliseconds: 100),
    VoidCallback? then,
  }) {
    _ramp?.cancel();
    const steps = 5;
    final from = _vol;
    if ((from - to).abs() < 0.01) {
      _vol = to;
      unawaited(c.setVolume(to));
      then?.call();
      return;
    }
    var i = 0;
    _ramp = Timer.periodic(over ~/ steps, (timer) {
      if (_c != c) {
        timer.cancel();
        return;
      }
      i++;
      _vol = from + (to - from) * (i / steps);
      unawaited(c.setVolume(_vol));
      if (i >= steps) {
        timer.cancel();
        then?.call();
      }
    });
  }

  @override
  void initState() {
    super.initState();
    if (widget.active || widget.warm) _open();
    // The poster is drawn only for a video that cannot play (see build);
    // then it is on screen at once (it is cached by the list).
    final thumb = widget.video.thumbnailUrl;
    if (thumb != null && !_playable) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          unawaited(
            // Owner 2026-10-18 (speed): warmed exactly as build() draws it
            // (same cache key, decoded at the same 720 px), so the warm
            // decode is the one found — not a second full-size decode.
            precacheImage(reelPosterProvider(thumb), context)
                .catchError((_) {}),
          );
        }
      });
    }
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
    // Owner 2026-10-19 (the «тк» before the sound): a mute change no longer
    // re-opens the player (that restart was heard), and every player uses
    // the same audio mode, so the phone's audio session is set once and
    // never switched while another reel plays — only the volume changes.
    if (widget.video.playbackUrl != old.video.playbackUrl) _close();
    if ((widget.active || widget.warm) && _c == null) _open();
    _apply();
  }

  /// There is a stream to play.
  bool get _playable =>
      widget.video.ready && widget.video.playerUrl(web: kIsWeb) != null;

  @override
  void didChangePlaybackVisibility({required bool visible}) => _apply();

  Future<void> _open() async {
    final url = widget.video.playerUrl(web: kIsWeb);
    if (url == null) return;
    // One audio mode for every reel (see didUpdateWidget): with sound a
    // reel takes the audio focus, like Instagram.
    final options = VideoPlayerOptions();
    final c = debugReelPlayerFactory?.call(Uri.parse(url), options) ??
        VideoPlayerController.networkUrl(
          Uri.parse(url),
          formatHint: widget.video.usesMp4(web: kIsWeb)
              ? VideoFormat.other
              : VideoFormat.hls,
          videoPlayerOptions: options,
        );
    _c = c;
    _slowTimer?.cancel();
    _slow = false;
    _slowTimer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted && _c == c && !_ready) setState(() => _slow = true);
    });
    c.addListener(_tick);
    try {
      await c.initialize();
      // Silent until it is the one on screen: a warmed neighbour never
      // makes a sound (not even while it seeks to its start).
      await c.setVolume(0);
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
      _openedAt = c.value.position;
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
    if (!_rendered && _ready && c.value.isPlaying && pos != _openedAt) {
      setState(() => _rendered = true);
    }
    // Owner 2026-10-19: just before the end the sound fades out, after the
    // loop back it rises again (no click at the seam).
    final left = clip.end - pos;
    if (c.value.isPlaying &&
        !_endFaded &&
        left > Duration.zero &&
        left < const Duration(milliseconds: 160)) {
      _endFaded = true;
      _fade(c, 0, over: const Duration(milliseconds: 80));
    }
    final looped = pos + const Duration(milliseconds: 500) < _lastPos;
    _lastPos = pos;
    if (looped && _endFaded) {
      _endFaded = false;
      _fade(c, _target);
    }
    // Only the trimmed part plays: past its end (or after the player's own
    // loop to 0) it jumps back to the start.
    if (clip.outside(pos) && !_seeking) {
      _seeking = true;
      _vol = 0;
      unawaited(c.setVolume(0));
      c.seekTo(clip.start).whenComplete(() {
        _seeking = false;
        _endFaded = false;
        if (_c == c) _fade(c, _target);
      });
      return;
    }
    widget.onProgress?.call(clip.progress(pos));
  }

  void _apply() {
    final c = _c;
    if (c == null || !_ready) return;
    final play = widget.active && !widget.paused && playbackVisible;
    // Exactly one reel is heard: the one playing. It starts silent and the
    // sound rises; before a pause it falls first (no click either way).
    if (play && !c.value.isPlaying) {
      _ramp?.cancel();
      _vol = 0;
      unawaited(c.setVolume(0));
      c.play();
      _fade(c, _target);
    } else if (!play && c.value.isPlaying) {
      _fade(
        c,
        0,
        over: const Duration(milliseconds: 80),
        then: () {
          final stillOff =
              !(widget.active && !widget.paused && playbackVisible);
          if (_c == c && stillOff && c.value.isPlaying) c.pause();
        },
      );
    } else {
      // Playing on (sound on / off) or paused: the volume follows smoothly.
      _fade(c, _target);
    }
  }

  void _close() {
    final c = _c;
    _c = null;
    _ready = false;
    _rendered = false;
    _failed = false;
    _slowTimer?.cancel();
    _slow = false;
    _clip = null;
    _seeking = false;
    _ramp?.cancel();
    _vol = 0;
    _lastPos = Duration.zero;
    _endFaded = false;
    c?.removeListener(_tick);
    // Silent before it goes (a playing player cut off clicks).
    if (c != null) {
      unawaited(
        c
            .setVolume(0)
            .then<void>((_) {}, onError: (Object _) {})
            .timeout(const Duration(milliseconds: 200), onTimeout: () {})
            .whenComplete(c.dispose),
      );
    }
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
    // Owner 2026-10-18: the cover only when nothing will play over it.
    final poster = thumb != null && (!_playable || _failed);
    final box = ColoredBox(
      color: widget.backdrop ? Colors.black : Colors.transparent,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (poster)
            CachedNetworkImage(
              imageUrl: thumb,
              cacheKey: stableImageCacheKey(thumb),
              memCacheWidth: kReelPosterDecodeWidth,
              fit: BoxFit.cover,
              fadeInDuration: Duration.zero,
              errorWidget: (_, __, ___) => const SizedBox.shrink(),
            ),
          if (c != null && _ready && (widget.backdrop || _rendered))
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
              _slow &&
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
    // The lifted copy draws the same player again (it keeps playing).
    return PinchToZoom(enabled: widget.zoomable, child: box);
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

  /// Any part of it on screen.
  bool _near = false;
  int _flash = 0;

  /// Owner 2026-10-19 (Instagram): held down = paused, let go = plays on.
  bool _held = false;

  Timer? _viewTimer;

  /// Owner 2026-10-19 (smooth scroll): a reel the finger flings past opens
  /// no player — it opens once the card stays on screen a moment.
  Timer? _settle;
  static const _settleDelay = Duration(milliseconds: 140);

  void _apply({required bool visible, required bool near}) {
    if (!mounted || (visible == _visible && near == _near)) return;
    final viewChanged = visible != _visible;
    setState(() {
      _visible = visible;
      _near = near;
    });
    if (viewChanged) _trackView();
  }

  /// Owner 2026-10-12: a reel counts as viewed after a few seconds on
  /// screen (once per viewer; the server dedups).
  /// Owner 2026-10-18: after ~2 s; the server counts one view per viewer
  /// per 24 h.
  void _trackView() {
    _viewTimer?.cancel();
    if (!_visible) return;
    _viewTimer = Timer(const Duration(seconds: 2), () {
      if (!mounted || !_visible) return;
      ProviderScope.containerOf(context)
          .read(socialActionsProvider)
          .recordView(widget.post);
    });
  }

  @override
  void dispose() {
    _viewTimer?.cancel();
    _settle?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final video = widget.post.video!;
    return VisibilityDetector(
      key: ValueKey('reel-${widget.post.id}'),
      onVisibilityChanged: (info) {
        final v = info.visibleFraction > 0.6;
        final near = info.visibleFraction > 0;
        _settle?.cancel();
        // Leaving frees the player at once; arriving waits for the scroll
        // to settle on it.
        if ((v && !_visible) || (near && !_near)) {
          _settle = Timer(
            _settleDelay,
            () => _apply(visible: v, near: near),
          );
        } else {
          _apply(visible: v, near: near);
        }
      },
      child: GestureDetector(
        // Owner 2026-10-13: in the feed a tap on the playing video opens the
        // full-screen player; pause / resume live in the player.
        onTap: widget.onOpen,
        onLongPressStart: (_) => setState(() => _held = true),
        onLongPressEnd: (_) => setState(() => _held = false),
        onLongPressCancel: () => setState(() => _held = false),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Consumer(
              builder: (context, ref, _) => ReelVideo(
                video: video,
                active: _visible && video.ready,
                // Owner 2026-10-18: the stream opens as soon as the card
                // peeks in, so its first frame is there when it plays.
                warm: _near && video.ready,
                muted: ref.watch(reelsMutedProvider),
                paused: _held,
                zoomable: true,
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
                  // Owner 2026-10-19: the app's player button look.
                  return PlayerRoundButton(
                    icon: muted ? AppIcons.speakerSlash : AppIcons.speakerHigh,
                    size: 28,
                    onTap: () {
                      ref.read(reelsMutedProvider.notifier).toggle();
                      setState(() => _flash++);
                    },
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
                        child: PlayerRoundButton(
                          icon: muted
                              ? AppIcons.speakerSlash
                              : AppIcons.speakerHigh,
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
