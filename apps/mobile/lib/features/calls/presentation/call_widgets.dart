import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';

/// Owner 2026-10-05: one WebRTC picture (ours mirrored, like a mirror).
class CallVideoView extends StatefulWidget {
  const CallVideoView({required this.stream, this.mirror = false, super.key});

  final MediaStream stream;
  final bool mirror;

  @override
  State<CallVideoView> createState() => _CallVideoViewState();
}

class _CallVideoViewState extends State<CallVideoView> {
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
  void didUpdateWidget(CallVideoView old) {
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

/// The member's photo in a gold ring, or their initials on navy.
class CallAvatar extends StatelessWidget {
  const CallAvatar({required this.peer, required this.size, super.key});

  final CallPeer? peer;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final url = peer?.avatarUrl;
    final initials = (peer?.name ?? '?')
        .replaceAll(RegExp('[@\u2066-\u2069]'), '')
        .split(' ')
        .where((w) => w.isNotEmpty)
        .take(2)
        .map((w) => w[0].toUpperCase())
        .join();
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          colors: [colors.goldLight, colors.gold, colors.goldDark],
        ),
      ),
      child: ClipOval(
        child: url == null
            ? ColoredBox(
                color: colors.navy,
                child: Center(
                  child: Text(
                    initials.isEmpty ? '?' : initials,
                    style: TextStyle(
                      color: colors.goldLight,
                      fontSize: size * 0.34,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              )
            : Image(image: appNetworkImage(url, 600), fit: BoxFit.cover),
      ),
    );
  }
}
