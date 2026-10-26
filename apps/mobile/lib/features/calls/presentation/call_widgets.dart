import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
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

/// Owner 2026-10-22: the member's photo, loaded and cached like every
/// avatar in the app ([AppAvatar] + [appNetworkImage], the same cache key),
/// with their initials underneath — a photo that is loading or fails to
/// load (an expired link, no network) shows the letters, never Flutter's
/// grey cross.
class CallAvatar extends StatelessWidget {
  const CallAvatar({required this.peer, required this.size, super.key});

  final CallPeer? peer;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = peer?.avatarUrl;
    return AppAvatar(
      size: size,
      initials: avatarInitials(peer?.name ?? ''),
      imageProvider: url == null || url.isEmpty
          ? null
          : appNetworkImage(url, decodeWidthFor(size)),
    );
  }
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
