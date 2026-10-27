import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';

/// Owner 2026-10-20 (WhatsApp / Telegram): the first screen of a new story is
/// the camera itself — a tap on the shutter takes a photo, holding it records
/// a video (up to [maxVideoSec] s). Bottom left the gallery, bottom right the
/// pen = a text story. When the live camera cannot open (no permission, no
/// camera, the web) the same buttons stay and the shutter hands over to the
/// system camera ([onSystemPhoto] / [onSystemVideo]).
class StoryCameraView extends StatefulWidget {
  const StoryCameraView({
    required this.maxVideoSec,
    required this.onPhoto,
    required this.onVideo,
    required this.onGallery,
    required this.onText,
    required this.onSystemPhoto,
    required this.onSystemVideo,
    required this.galleryLabel,
    required this.shutterLabel,
    required this.textLabel,
    required this.flipLabel,
    this.enabled = true,
    super.key,
  });

  final int maxVideoSec;
  final ValueChanged<XFile> onPhoto;
  final ValueChanged<XFile> onVideo;
  final VoidCallback onGallery;
  final VoidCallback onText;
  final VoidCallback onSystemPhoto;
  final VoidCallback onSystemVideo;
  final String galleryLabel;
  final String shutterLabel;
  final String textLabel;
  final String flipLabel;

  /// False while a pick is in progress.
  final bool enabled;

  @override
  State<StoryCameraView> createState() => _StoryCameraViewState();
}

class _StoryCameraViewState extends State<StoryCameraView>
    with WidgetsBindingObserver {
  CameraController? _controller;
  List<CameraDescription> _cameras = const [];
  int _lens = 0;
  bool _failed = false;
  bool _recording = false;
  bool _busy = false;
  DateTime? _recordStart;
  Timer? _ticker;
  double _progress = 0;
  AppLifecycleState _lifecycle =
      WidgetsBinding.instance.lifecycleState ?? AppLifecycleState.resumed;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_init());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    unawaited(_controller?.dispose());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _lifecycle = state;
    if (state == AppLifecycleState.inactive) {
      final c = _controller;
      if (c == null) return;
      setState(() => _controller = null);
      unawaited(c.dispose());
    } else if (state == AppLifecycleState.resumed &&
        _controller == null &&
        !_failed) {
      unawaited(_init());
    }
  }

  Future<void> _init() async {
    if (kIsWeb) {
      setState(() => _failed = true);
      return;
    }
    try {
      if (_cameras.isEmpty) _cameras = await availableCameras();
      if (_cameras.isEmpty) throw CameraException('none', 'no camera');
      final controller = CameraController(
        _cameras[_lens % _cameras.length],
        ResolutionPreset.high,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted ||
          _lifecycle != AppLifecycleState.resumed ||
          _controller != null) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _failed = false;
      });
    } on Object {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _flip() async {
    final c = _controller;
    if (c == null || _recording || _cameras.length < 2) return;
    setState(() {
      _controller = null;
      _lens++;
    });
    await c.dispose();
    await _init();
  }

  Future<void> _photo() async {
    final c = _controller;
    if (!widget.enabled || _busy || _recording) return;
    if (c == null || !c.value.isInitialized) {
      widget.onSystemPhoto();
      return;
    }
    setState(() => _busy = true);
    try {
      final file = await c.takePicture();
      if (mounted) widget.onPhoto(file);
    } on Object {
      if (mounted) widget.onSystemPhoto();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _startRecording() async {
    final c = _controller;
    if (!widget.enabled || _busy || _recording) return;
    if (c == null || !c.value.isInitialized) {
      widget.onSystemVideo();
      return;
    }
    try {
      await c.startVideoRecording();
    } on Object {
      if (mounted) widget.onSystemVideo();
      return;
    }
    unawaited(AppHaptics.medium());
    _recordStart = DateTime.now();
    setState(() {
      _recording = true;
      _progress = 0;
    });
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) {
      final start = _recordStart;
      if (start == null || !mounted) return;
      final ms = DateTime.now().difference(start).inMilliseconds;
      final p = ms / (widget.maxVideoSec * 1000);
      if (p >= 1) {
        unawaited(_stopRecording());
      } else {
        setState(() => _progress = p);
      }
    });
  }

  Future<void> _stopRecording() async {
    final c = _controller;
    if (!_recording || c == null) return;
    _ticker?.cancel();
    final ms = DateTime.now()
        .difference(_recordStart ?? DateTime.now())
        .inMilliseconds;
    setState(() {
      _recording = false;
      _progress = 0;
    });
    try {
      final file = await c.stopVideoRecording();
      // A touch shorter than a moment is a mis-tap, not a video.
      if (mounted && ms >= 500) widget.onVideo(file);
    } on Object {
      if (mounted) widget.onSystemVideo();
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final ready = controller != null && controller.value.isInitialized;
    return ColoredBox(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (ready)
            ClipRect(
              child: FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(
                  width: controller.value.previewSize?.height ?? 1,
                  height: controller.value.previewSize?.width ?? 1,
                  child: CameraPreview(controller),
                ),
              ),
            ),
          if (ready && _cameras.length > 1 && !_recording)
            PositionedDirectional(
              top: AppSpacing.md,
              end: AppSpacing.screenSide,
              child: _RoundButton(
                key: const ValueKey('story-camera-flip'),
                icon: AppIcons.cameraRotateOutlined,
                label: widget.flipLabel,
                onTap: _flip,
              ),
            ),
          Align(
            alignment: Alignment.bottomCenter,
            child: SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  0,
                  AppSpacing.screenSide,
                  AppSpacing.xl,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _RoundButton(
                      key: const ValueKey('story-pick-gallery'),
                      icon: AppIcons.photoLibraryOutlined,
                      label: widget.galleryLabel,
                      onTap: widget.enabled && !_recording
                          ? widget.onGallery
                          : null,
                    ),
                    _Shutter(
                      label: widget.shutterLabel,
                      recording: _recording,
                      progress: _progress,
                      onTap: _photo,
                      onHoldStart: _startRecording,
                      onHoldEnd: _stopRecording,
                    ),
                    _RoundButton(
                      key: const ValueKey('story-pick-text'),
                      icon: AppIcons.titleRounded,
                      label: widget.textLabel,
                      onTap:
                          widget.enabled && !_recording ? widget.onText : null,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => AppTapTarget(
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.4),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: Colors.white, size: AppSizes.iconLg),
            ),
          ),
        ),
      );
}

class _Shutter extends StatelessWidget {
  const _Shutter({
    required this.label,
    required this.recording,
    required this.progress,
    required this.onTap,
    required this.onHoldStart,
    required this.onHoldEnd,
  });

  final String label;
  final bool recording;
  final double progress;
  final VoidCallback onTap;
  final VoidCallback onHoldStart;
  final VoidCallback onHoldEnd;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: GestureDetector(
        key: const ValueKey('story-shutter'),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        onLongPressStart: (_) => onHoldStart(),
        onLongPressEnd: (_) => onHoldEnd(),
        onLongPressCancel: onHoldEnd,
        child: SizedBox(
          width: 84,
          height: 84,
          child: Stack(
            alignment: Alignment.center,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 120),
                width: recording ? 84 : 72,
                height: recording ? 84 : 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 4),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(5),
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: recording ? colors.danger : Colors.white,
                    ),
                  ),
                ),
              ),
              if (recording)
                SizedBox.square(
                  dimension: 84,
                  child: CircularProgressIndicator(
                    value: progress.clamp(0.02, 1),
                    strokeWidth: 4,
                    color: colors.gold,
                    backgroundColor: Colors.transparent,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
