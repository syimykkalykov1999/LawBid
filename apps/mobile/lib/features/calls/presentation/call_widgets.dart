import 'dart:ui' show ImageFilter;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// Owner 2026-10-23: only OUR picture from the FRONT camera is mirrored, like
/// a mirror (WhatsApp / FaceTime). A rear camera shows the room as it is,
/// and a remote picture is never mirrored.
bool callMirrorFor({required bool isLocal, required bool frontCamera}) =>
    isLocal && frontCamera;

/// Draws a camera picture. Null = the real WebRTC renderer; widget tests
/// and the screenshot harness put a stand-in here (no WebRTC there).
typedef CallVideoSurface = Widget Function(MediaStream stream, {bool mirror});

final callVideoSurfaceProvider = Provider<CallVideoSurface?>((_) => null);

/// Owner 2026-10-05: one WebRTC picture (ours mirrored, like a mirror).
class CallVideoView extends ConsumerWidget {
  const CallVideoView({required this.stream, this.mirror = false, super.key});

  final MediaStream stream;
  final bool mirror;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final surface = ref.watch(callVideoSurfaceProvider);
    // A picture never repaints what is around it (and the other way round).
    return RepaintBoundary(
      child: surface != null
          ? surface(stream, mirror: mirror)
          : _RtcVideo(stream: stream, mirror: mirror),
    );
  }
}

class _RtcVideo extends StatefulWidget {
  const _RtcVideo({required this.stream, required this.mirror});

  final MediaStream stream;
  final bool mirror;

  @override
  State<_RtcVideo> createState() => _RtcVideoState();
}

class _RtcVideoState extends State<_RtcVideo> {
  final _renderer = RTCVideoRenderer();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _renderer.initialize();
    if (!mounted) {
      await _renderer.dispose();
      return;
    }
    _renderer.srcObject = widget.stream;
    // Web: the call's sound already plays through CallMedia.
    if (kIsWeb) _renderer.muted = true;
    setState(() => _ready = true);
  }

  @override
  void didUpdateWidget(_RtcVideo old) {
    super.didUpdateWidget(old);
    if (_ready && old.stream != widget.stream) {
      _renderer.srcObject = widget.stream;
      if (kIsWeb) _renderer.muted = true;
    }
  }

  @override
  void dispose() {
    _renderer
      ..srcObject = null
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => !_ready
      ? const ColoredBox(color: Colors.black)
      : RTCVideoView(
          _renderer,
          mirror: widget.mirror,
          objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
        );
}

/// Owner 2026-10-22: the call screen stays dark navy in every theme; the
/// ink and fills drawn on it come from the theme's tokens, named here once.
extension CallInk on AppColorTokens {
  /// Icons and text on the call's dark background (white in every theme —
  /// the same ink as on the red end button).
  Color get callInk => onDanger;

  /// The dark pill behind the call buttons (WhatsApp): opaque, so it reads
  /// the same over the navy and over a moving picture.
  Color get callPill =>
      Color.alphaBlend(onDanger.withValues(alpha: 0.10), navy);

  /// The round backing of a small icon laid over a picture.
  Color get callScrim => navy.withValues(alpha: 0.6);
}

/// Owner 2026-10-26 (calls like WhatsApp): the person's photo in a round
/// frame; without a photo (or while it loads, or when the link fails) a
/// coloured circle with their initials — the colour stays the same for the
/// same person. Never Flutter's grey cross.
class CallAvatar extends StatelessWidget {
  const CallAvatar({
    required this.peer,
    required this.size,
    this.ring,
    super.key,
  });

  final CallPeer? peer;
  final double size;

  /// A coloured ring around it (whoever speaks).
  final Color? ring;

  @override
  Widget build(BuildContext context) {
    final url = peer?.avatarUrl;
    final name = peer?.name ?? '';
    const fills = AppCallColors.avatarFills;
    final fill = fills[(peer?.id ?? name).hashCode.abs() % fills.length];
    final letters = Center(
      child: Text(
        avatarInitials(name),
        maxLines: 1,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: size * 0.36,
          height: 1,
        ),
      ),
    );
    return AnimatedContainer(
      duration: context.reduceMotion ? Duration.zero : CallMotion.quick,
      width: size,
      height: size,
      padding: EdgeInsets.all(ring == null ? 0 : 3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: ring ?? Colors.transparent,
          width: ring == null ? 0 : 2.5,
        ),
      ),
      child: ClipOval(
        child: ColoredBox(
          color: fill,
          child: url == null || url.isEmpty
              ? letters
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    letters,
                    Image(
                      image: appNetworkImage(url, decodeWidthFor(size)),
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// AN-1 / UI-09 (REFERENCE.md «Background»; WhatsApp / FaceTime): behind
/// the big photo of a voice call, a camera that is off or a group tile
/// without a picture — the person's photo enlarged and blurred (σ 40)
/// under a 45 % wash of the call's dark colour, never a flat box. Without
/// a photo (or while it loads, or when the link fails) it draws nothing and
/// the plain background behind shows. The blur is costly: it sits behind a
/// RepaintBoundary and decodes the photo at 64 px.
class CallPhotoBackdrop extends StatelessWidget {
  const CallPhotoBackdrop({required this.url, super.key});

  final String? url;

  @override
  Widget build(BuildContext context) {
    final link = url;
    if (link == null || link.isEmpty) return const SizedBox.shrink();
    return RepaintBoundary(
      child: ClipRect(
        child: Stack(
          fit: StackFit.expand,
          children: [
            ImageFiltered(
              imageFilter: ImageFilter.blur(sigmaX: 40, sigmaY: 40),
              child: Image(
                image: appNetworkImage(link, 64),
                fit: BoxFit.cover,
                gaplessPlayback: true,
                excludeFromSemantics: true,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
            ColoredBox(color: AppCallColors.stage.withValues(alpha: 0.45)),
          ],
        ),
      ),
    );
  }
}

/// Owner 2026-10-26: one motion for the whole call (REFERENCE.md) —
/// 300 ms ease-out for layout, 200 ms for cross-fades.
abstract final class CallMotion {
  static const Duration layout = Duration(milliseconds: 300);
  static const Duration quick = Duration(milliseconds: 200);
  static const Curve curve = Curves.easeOutCubic;
}

/// Owner 2026-10-26: the call's type sizes (REFERENCE.md): the name over
/// the picture 17/600, the timer and status 13, the big name of a voice
/// call 26/600, a tile's name 12/600.
abstract final class CallTextSizes {
  static const double title = 17;
  static const double status = 13;
  static const double bigName = 26;
  static const double bigStatus = 15;
  static const double tile = 12;
}

/// Text that floats over a picture: a soft shadow instead of a dark bar.
const List<Shadow> kCallTextShadow = [
  Shadow(color: Colors.black54, blurRadius: 6, offset: Offset(0, 1)),
];

/// Owner 2026-10-26: a call button that shrinks under the finger (0.9 in
/// 120 ms) and gives a light tap of haptics — no Material ink over video.
class CallPressScale extends StatefulWidget {
  const CallPressScale({
    required this.child,
    required this.onTap,
    this.scale = 0.9,
    this.duration = const Duration(milliseconds: 120),
    super.key,
  });

  final Widget child;
  final VoidCallback? onTap;
  final double scale;
  final Duration duration;

  @override
  State<CallPressScale> createState() => _CallPressScaleState();
}

class _CallPressScaleState extends State<CallPressScale> {
  bool _down = false;

  void _set(bool down) {
    if (widget.onTap == null || _down == down) return;
    setState(() => _down = down);
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: (_) => _set(true),
        onTapCancel: () => _set(false),
        onTapUp: (_) => _set(false),
        onTap: widget.onTap == null
            ? null
            : () {
                HapticFeedback.lightImpact();
                widget.onTap!();
              },
        child: AnimatedScale(
          scale: _down ? widget.scale : 1,
          duration: context.reduceMotion ? Duration.zero : widget.duration,
          curve: Curves.easeOut,
          child: widget.child,
        ),
      );
}

/// A small round icon button laid over a picture (put away, expand).
class CallOverlayIcon extends StatelessWidget {
  const CallOverlayIcon({
    required this.icon,
    required this.label,
    required this.onTap,
    this.size = 14,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: colors.callScrim,
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xs),
              child: AppIcon(icon, size: size, color: colors.callInk),
            ),
          ),
        ),
      ),
    );
  }
}
