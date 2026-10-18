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
    final ratio = size.height > 0
        ? (size.width / size.height).clamp(0.6, 1.8)
        : (a.width != null && a.height != null && a.height! > 0)
            ? (a.width! / a.height!).clamp(0.6, 1.8)
            : 16 / 9;
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

class _ChatVideoScreenState extends State<ChatVideoScreen> {
  late final VideoPlayerController _c =
      VideoPlayerController.networkUrl(Uri.parse(widget.url));
  bool _controls = true;
  bool _failed = false;

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
        },
        onError: (Object _) {
          if (mounted) setState(() => _failed = true);
        },
      ),
    );
  }

  void _tick() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _c.removeListener(_tick);
    unawaited(_c.dispose());
    super.dispose();
  }

  Future<void> _toggle() async {
    unawaited(HapticFeedback.selectionClick());
    if (_c.value.isPlaying) {
      await _c.pause();
    } else {
      if (_c.value.position >= _c.value.duration) {
        await _c.seekTo(Duration.zero);
      }
      await _c.play();
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final v = _c.value;
    final total = v.duration;
    final pos = v.position > total ? total : v.position;
    final clock = type.caption.copyWith(
      color: Colors.white,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => setState(() => _controls = !_controls),
          child: Stack(
            children: [
              Center(
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
              if (_controls) ...[
                SafeArea(
                  child: Align(
                    alignment: Alignment.topLeft,
                    child: IconButton(
                      onPressed: () => Navigator.of(context).maybePop(),
                      icon: const AppIcon(
                        AppIcons.closeRounded,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                if (v.isInitialized)
                  Center(
                    child: AppPressable(
                      onTap: _toggle,
                      child: Container(
                        width: 64,
                        height: 64,
                        decoration: const BoxDecoration(
                          color: Colors.black45,
                          shape: BoxShape.circle,
                        ),
                        child: AppIcon(
                          v.isPlaying
                              ? AppIcons.pauseRounded
                              : AppIcons.playArrowRounded,
                          color: Colors.white,
                          size: 40,
                        ),
                      ),
                    ),
                  ),
                if (v.isInitialized)
                  SafeArea(
                    child: Align(
                      alignment: Alignment.bottomCenter,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        child: Row(
                          children: [
                            Text(voiceClock(pos), style: clock),
                            Expanded(
                              child: Slider(
                                value: pos.inMilliseconds.toDouble(),
                                max: math
                                    .max(1, total.inMilliseconds)
                                    .toDouble(),
                                activeColor: Colors.white,
                                inactiveColor: Colors.white30,
                                thumbColor: Colors.white,
                                onChanged: (x) => _c.seekTo(
                                  Duration(milliseconds: x.round()),
                                ),
                              ),
                            ),
                            Text(voiceClock(total), style: clock),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
