import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:video_player/video_player.dart';

/// Owner 2026-10-17 (WhatsApp): a video in a chat bubble — its first frame,
/// a round play button and the length; a tap opens it full screen. While
/// it uploads: a dark tile with the progress ring.
class ChatVideoTile extends StatefulWidget {
  const ChatVideoTile({
    required this.attachment,
    required this.sending,
    required this.playLabel,
    super.key,
  });

  final ChatAttachment attachment;
  final bool sending;
  final String playLabel;

  @override
  State<ChatVideoTile> createState() => _ChatVideoTileState();
}

class _ChatVideoTileState extends State<ChatVideoTile> {
  VideoPlayerController? _c;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _open();
  }

  @override
  void didUpdateWidget(ChatVideoTile old) {
    super.didUpdateWidget(old);
    if (old.attachment.url != widget.attachment.url && _c == null) _open();
  }

  /// The first frame and the length (only the start of the file loads).
  void _open() {
    final url = widget.attachment.url;
    if (url == null) return;
    final c = VideoPlayerController.networkUrl(Uri.parse(url));
    _c = c;
    unawaited(
      c.initialize().then(
        (_) {
          if (mounted) setState(() => _ready = true);
        },
        onError: (Object _) {},
      ),
    );
  }

  @override
  void dispose() {
    unawaited(_c?.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = widget.attachment;
    final c = _c;
    final size = _ready ? c!.value.size : Size.zero;
    // Owner 2026-10-18: the bubble's shape never changes once shown — the
    // server's size of the video (width/height), else a phone-portrait
    // 3:4; the loaded video fills that box (cover) instead of resizing it.
    final ratio = (a.width != null && a.height != null && a.height! > 0)
        ? (a.width! / a.height!).clamp(0.6, 1.8)
        : 3 / 4;
    final pct = a.progress > 0 && a.progress < 1 ? a.progress : null;
    final url = a.url;
    return Semantics(
      button: url != null,
      label: widget.playLabel,
      child: AppPressable(
        onTap: url == null || widget.sending
            ? () {}
            : () => Navigator.of(context, rootNavigator: true).push(
                  MaterialPageRoute<void>(
                    fullscreenDialog: true,
                    builder: (_) => ChatVideoScreen(url: url),
                  ),
                ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 220,
            child: AspectRatio(
              aspectRatio: ratio,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  const ColoredBox(color: Colors.black),
                  if (_ready)
                    FittedBox(
                      fit: BoxFit.cover,
                      clipBehavior: Clip.hardEdge,
                      child: SizedBox(
                        width: size.width,
                        height: size.height,
                        child: VideoPlayer(c!),
                      ),
                    ),
                  Center(
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: const BoxDecoration(
                        color: Colors.black54,
                        shape: BoxShape.circle,
                      ),
                      alignment: Alignment.center,
                      child: widget.sending
                          ? SizedBox.square(
                              dimension: 28,
                              child: CircularProgressIndicator(
                                value: pct,
                                strokeWidth: 3,
                                color: Colors.white,
                              ),
                            )
                          : const AppIcon(
                              AppIcons.playArrowRounded,
                              color: Colors.white,
                              size: 32,
                            ),
                    ),
                  ),
                  if (_ready)
                    Positioned(
                      left: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const AppIcon(
                              AppIcons.videoCameraOutlined,
                              color: Colors.white,
                              size: 14,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              voiceClock(c!.value.duration),
                              style: type.caption.copyWith(
                                color: Colors.white,
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A chat video full screen: plays at once; tap shows / hides the controls
/// (play / pause, a seek bar, time); the close button or a swipe back.
class ChatVideoScreen extends StatefulWidget {
  const ChatVideoScreen({required this.url, super.key});

  final String url;

  @override
  State<ChatVideoScreen> createState() => _ChatVideoScreenState();
}

/// Owner 2026-10-17 (WhatsApp): the video fills the screen width; the big
/// play button shows only while paused; the bottom bar has play / pause,
/// the time and the seek bar; the controls hide by themselves after 3 s of
/// playing and come back on a tap; a swipe down closes.
class _ChatVideoScreenState extends State<ChatVideoScreen> {
  late final VideoPlayerController _c =
      VideoPlayerController.networkUrl(Uri.parse(widget.url));
  bool _controls = true;
  bool _failed = false;
  bool _wasPlaying = false;
  Timer? _hide;
  double _drag = 0;

  /// While the thumb is dragged: its spot (the player catches up).
  double? _scrubMs;

  @override
  void initState() {
    super.initState();
    _c.addListener(_tick);
    unawaited(
      _c.initialize().then(
        (_) async {
          if (!mounted) return;
          setState(() {});
          await _c.play();
          _scheduleHide();
        },
        onError: (Object _) {
          if (mounted) setState(() => _failed = true);
        },
      ),
    );
  }

  void _tick() {
    if (!mounted) return;
    final v = _c.value;
    // Ended: back to the controls with the play button (WhatsApp).
    if (_wasPlaying && !v.isPlaying && v.position >= v.duration) {
      _hide?.cancel();
      _controls = true;
    }
    _wasPlaying = v.isPlaying;
    setState(() {});
  }

  void _scheduleHide() {
    _hide?.cancel();
    _hide = Timer(const Duration(seconds: 3), () {
      if (mounted && _c.value.isPlaying && _scrubMs == null) {
        setState(() => _controls = false);
      }
    });
  }

  void _tapScreen() {
    setState(() => _controls = !_controls);
    if (_controls) _scheduleHide();
  }

  @override
  void dispose() {
    _hide?.cancel();
    _c.removeListener(_tick);
    unawaited(_c.dispose());
    super.dispose();
  }

  Future<void> _toggle() async {
    unawaited(HapticFeedback.selectionClick());
    if (_c.value.isPlaying) {
      _hide?.cancel();
      await _c.pause();
    } else {
      if (_c.value.position >= _c.value.duration) {
        await _c.seekTo(Duration.zero);
      }
      await _c.play();
      _scheduleHide();
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final v = _c.value;
    final total = v.duration;
    final pos = v.position > total ? total : v.position;
    final shownMs = _scrubMs ?? pos.inMilliseconds.toDouble();
    final maxMs = math.max(1, total.inMilliseconds).toDouble();
    final clock = type.caption.copyWith(
      color: Colors.white,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    final fade = context.reduceMotion
        ? Duration.zero
        : const Duration(milliseconds: 200);
    final paused = v.isInitialized && !v.isPlaying;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: _tapScreen,
          // Swipe down to close, like a photo.
          onVerticalDragUpdate: (d) =>
              setState(() => _drag = math.max(0, _drag + d.delta.dy)),
          onVerticalDragEnd: (_) {
            if (_drag > 120) {
              Navigator.of(context).maybePop();
            } else {
              setState(() => _drag = 0);
            }
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              Positioned.fill(
                child: Transform.translate(
                  offset: Offset(0, _drag),
                  child: Center(
                    child: v.isInitialized
                        ? AspectRatio(
                            aspectRatio: v.aspectRatio,
                            child: VideoPlayer(_c),
                          )
                        : _failed
                            ? const AppIcon(
                                AppIcons.errorOutlineRounded,
                                color: Colors.white54,
                                size: 40,
                              )
                            : const CircularProgressIndicator(
                                color: Colors.white,
                              ),
                  ),
                ),
              ),
              // Paused or ended: one big play button in the middle.
              if (paused && _drag == 0)
                Positioned.fill(
                  child: Center(
                    child: AppPressable(
                      onTap: _toggle,
                      child: Container(
                        width: 72,
                        height: 72,
                        decoration: const BoxDecoration(
                          color: Colors.black54,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: const AppIcon(
                          AppIcons.playArrowRounded,
                          color: Colors.white,
                          size: 44,
                        ),
                      ),
                    ),
                  ),
                ),
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: AnimatedOpacity(
                  opacity: _controls && _drag == 0 ? 1 : 0,
                  duration: fade,
                  child: IgnorePointer(
                    ignoring: !_controls,
                    child: Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.black54, Colors.transparent],
                        ),
                      ),
                      child: SafeArea(
                        bottom: false,
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: IconButton(
                            onPressed: () => Navigator.of(context).maybePop(),
                            icon: const AppIcon(
                              AppIcons.closeRounded,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              if (v.isInitialized)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: AnimatedOpacity(
                    opacity: _controls && _drag == 0 ? 1 : 0,
                    duration: fade,
                    child: IgnorePointer(
                      ignoring: !_controls,
                      child: Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.bottomCenter,
                            end: Alignment.topCenter,
                            colors: [Colors.black54, Colors.transparent],
                          ),
                        ),
                        child: SafeArea(
                          top: false,
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(8, 16, 16, 8),
                            child: Row(
                              children: [
                                IconButton(
                                  onPressed: _toggle,
                                  icon: AppIcon(
                                    v.isPlaying
                                        ? AppIcons.pauseRounded
                                        : AppIcons.playArrowRounded,
                                    color: Colors.white,
                                    size: 28,
                                  ),
                                ),
                                Text(
                                  voiceClock(
                                    Duration(milliseconds: shownMs.round()),
                                  ),
                                  style: clock,
                                ),
                                Expanded(
                                  child: SliderTheme(
                                    data: SliderTheme.of(context).copyWith(
                                      trackHeight: 3,
                                      thumbShape: const RoundSliderThumbShape(
                                        enabledThumbRadius: 7,
                                      ),
                                      overlayShape:
                                          const RoundSliderOverlayShape(
                                        overlayRadius: 14,
                                      ),
                                    ),
                                    child: Slider(
                                      value: shownMs.clamp(0, maxMs),
                                      max: maxMs,
                                      activeColor: Colors.white,
                                      inactiveColor: Colors.white30,
                                      thumbColor: Colors.white,
                                      onChangeStart: (x) {
                                        _hide?.cancel();
                                        setState(() => _scrubMs = x);
                                      },
                                      onChanged: (x) {
                                        setState(() => _scrubMs = x);
                                        unawaited(
                                          _c.seekTo(
                                            Duration(milliseconds: x.round()),
                                          ),
                                        );
                                      },
                                      onChangeEnd: (x) async {
                                        await _c.seekTo(
                                          Duration(milliseconds: x.round()),
                                        );
                                        if (mounted) {
                                          setState(() => _scrubMs = null);
                                        }
                                        _scheduleHide();
                                      },
                                    ),
                                  ),
                                ),
                                Text(voiceClock(total), style: clock),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
