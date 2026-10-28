import 'dart:async';
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/platform/app_settings_opener.dart';
import 'package:lawbid/core/platform/secure_screen.dart';
import 'package:lawbid/features/verification/application/selfie_capture_session.dart';
import 'package:lawbid/features/verification/data/selfie_frame_detector.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/presentation/widgets/id_selfie_capture_view.dart';

/// The on-device detector; overridden in tests.
final selfieFrameDetectorProvider = Provider.autoDispose<SelfieFrameDetector>(
  (ref) {
    final d = MlKitSelfieFrameDetector();
    ref.onDispose(d.close);
    return d;
  },
);

/// Owner 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md):
/// the app's own guided «selfie with your ID» camera — front camera, face
/// oval + ID-card frame, one random liveness prompt checked on the phone
/// (ML Kit), auto-capture of 2 frames (the best kept), capture only from
/// the live camera (no gallery). Pops with a [PickedDocument] carrying a
/// [SelfieCaptureReport], or null.
///
/// Smoothness: the preview is the camera texture at its native rate;
/// detection runs on a throttled stream inside ML Kit's native threads
/// (one in flight, extra frames dropped, interval adapts to the phone's
/// speed); the overlay rebuilds only when what it draws changes; camera
/// and stream are released on pause and rebuilt on resume.
class IdSelfieCaptureScreen extends ConsumerStatefulWidget {
  const IdSelfieCaptureScreen({super.key});

  @override
  ConsumerState<IdSelfieCaptureScreen> createState() =>
      _IdSelfieCaptureScreenState();
}

enum _CameraError { denied, unavailable }

/// Frames kept per auto-capture; the largest JPEG (most detail = least
/// blur) is used.
const _framesPerCapture = 2;

class _IdSelfieCaptureScreenState extends ConsumerState<IdSelfieCaptureScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  _CameraError? _error;
  bool _busy = false;
  bool _streaming = false;
  Uint8List? _shot;
  SelfieCaptureReport? _report;
  Size? _screen;
  SelfieCaptureSession<CameraImage>? _session;
  late final SelfieFrameDetector _detector =
      ref.read(selfieFrameDetectorProvider);
  final Stopwatch _clock = Stopwatch();
  DateTime _startedAt = DateTime.now();
  Timer? _ticker;
  OvalTone _lastTone = OvalTone.neutral;

  AppLifecycleState _lifecycle =
      WidgetsBinding.instance.lifecycleState ?? AppLifecycleState.resumed;

  bool get _detecting =>
      _detector.available && !(_session?.manual.value ?? false);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _ticker?.cancel();
    _session?.view.removeListener(_onView);
    _session?.dispose();
    final c = _controller;
    _controller = null;
    unawaited(_release(c));
    super.dispose();
  }

  Future<void> _release(CameraController? c) async {
    if (c == null) return;
    try {
      if (c.value.isStreamingImages) await c.stopImageStream();
    } on Object {
      // Already stopped.
    }
    await c.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _lifecycle = state;
    if (state == AppLifecycleState.inactive) {
      _ticker?.cancel();
      final c = _controller;
      if (c == null) return;
      setState(() {
        _controller = null;
        _streaming = false;
      });
      unawaited(_release(c));
    } else if (state == AppLifecycleState.resumed) {
      if (_controller != null || _shot != null || _error != null) return;
      _init();
    }
  }

  SelfieCaptureSession<CameraImage> _sessionFor(Size screen) {
    final existing = _session;
    if (existing != null) return existing;
    final s = SelfieCaptureSession<CameraImage>(
      detect: _detect,
      clock: () => _clock.elapsed,
      config: SelfieGuideLayout(screen).config(),
    );
    s.view.addListener(_onView);
    s.manual.addListener(_onManual);
    _session = s;
    return s;
  }

  Future<FrameSignals> _detect(CameraImage image, {required bool readText}) {
    final c = _controller;
    final screen = _screen;
    if (c == null || screen == null) {
      return Future.value(const FrameSignals(faces: []));
    }
    return _detector.detect(
      image,
      camera: c.description,
      orientation: c.value.deviceOrientation,
      screen: screen,
      readText: readText,
    );
  }

  Future<void> _init() async {
    try {
      final cameras = await availableCameras();
      final camera = cameras
              .where((c) => c.lensDirection == CameraLensDirection.front)
              .firstOrNull ??
          cameras.firstOrNull;
      if (camera == null) {
        if (mounted) setState(() => _error = _CameraError.unavailable);
        return;
      }
      final controller = CameraController(
        camera,
        // 720p: sharp enough to read the ID in the selfie, light enough
        // for detection on low-end phones (the interval adapts too).
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: _detector.available
            ? _detector.streamFormat
            : ImageFormatGroup.jpeg,
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
        _error = null;
      });
      _startAttempt();
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.code.startsWith('CameraAccess')
            ? _CameraError.denied
            : _CameraError.unavailable,
      );
    }
  }

  /// (Re)starts the timers and the frame stream for a new attempt.
  void _startAttempt() {
    _clock
      ..reset()
      ..start();
    _startedAt = DateTime.now();
    _lastTone = OvalTone.neutral;
    _session?.reset();
    _ticker?.cancel();
    _ticker = Timer.periodic(
      const Duration(milliseconds: 200),
      (_) => _session?.tick(),
    );
    _startStream();
  }

  Future<void> _startStream() async {
    final c = _controller;
    if (c == null || !_detecting || _streaming) return;
    try {
      await c.startImageStream((image) {
        final s = _session;
        if (s != null) unawaited(s.onFrame(image));
      });
      _streaming = true;
    } on Object {
      _session?.manual.value = true;
    }
  }

  Future<void> _stopStream() async {
    final c = _controller;
    if (c == null || !_streaming) return;
    _streaming = false;
    try {
      await c.stopImageStream();
    } on Object {
      // Already stopped.
    }
  }

  /// The detector failed: stop feeding it; the view switches to manual.
  void _onManual() {
    if (mounted) unawaited(_stopStream());
  }

  void _onView() {
    final v = _session?.view.value;
    if (v == null || !mounted || _shot != null || _busy) return;
    if (v.tone == OvalTone.ready && _lastTone != OvalTone.ready) {
      unawaited(AppHaptics.selection());
    }
    _lastTone = v.tone;
    if (v.autoCaptureDue) {
      _capture(LivenessResult.passed);
    }
  }

  void _onShutter() {
    final s = _session;
    final manual = !_detector.available || (s?.manual.value ?? true);
    if (manual) {
      _capture(LivenessResult.notChecked, fallback: 'detector_unavailable');
    } else {
      _capture(LivenessResult.passed);
    }
  }

  void _onAnyway() => _capture(LivenessResult.skipped, fallback: 'timeout');

  Future<void> _capture(LivenessResult result, {String? fallback}) async {
    final c = _controller;
    if (c == null || _busy || !c.value.isInitialized) return;
    setState(() => _busy = true);
    _ticker?.cancel();
    await _stopStream();
    final machine = _session?.machine;
    try {
      Uint8List? best;
      var frames = 0;
      for (var i = 0; i < _framesPerCapture; i++) {
        try {
          final bytes = await (await c.takePicture()).readAsBytes();
          frames++;
          if (best == null || bytes.length > best.length) best = bytes;
        } on CameraException {
          if (best == null && i == _framesPerCapture - 1) rethrow;
        }
      }
      if (best == null || !mounted) return;
      unawaited(AppHaptics.medium());
      setState(() {
        _shot = best;
        _report = SelfieCaptureReport(
          liveness: result,
          challenge:
              result == LivenessResult.notChecked ? null : machine?.challenge,
          fallbackReason: fallback,
          faceDetected: machine?.faceDetected ?? false,
          cardDetected: machine?.cardDetected ?? false,
          framesCaptured: frames,
          startedAt: _startedAt,
          capturedAt: DateTime.now(),
          platform: _platform,
        );
      });
    } on CameraException {
      if (mounted) setState(() => _error = _CameraError.unavailable);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static String get _platform => kIsWeb
      ? 'web'
      : defaultTargetPlatform == TargetPlatform.iOS
          ? 'ios'
          : 'android';

  void _retake() {
    setState(() {
      _shot = null;
      _report = null;
    });
    if (_controller == null) {
      if (_lifecycle == AppLifecycleState.resumed) _init();
      return;
    }
    _startAttempt();
  }

  Future<void> _use() async {
    final bytes = _shot;
    final report = _report;
    if (bytes == null || report == null) return;
    final model = await _deviceModel();
    if (!mounted) return;
    Navigator.of(context).pop(
      PickedDocument(
        name: 'selfie.jpg',
        mime: 'image/jpeg',
        bytes: bytes,
        selfieCapture: SelfieCaptureReport(
          liveness: report.liveness,
          challenge: report.challenge,
          fallbackReason: report.fallbackReason,
          faceDetected: report.faceDetected,
          cardDetected: report.cardDetected,
          framesCaptured: report.framesCaptured,
          startedAt: report.startedAt,
          capturedAt: report.capturedAt,
          platform: report.platform,
          deviceModel: model,
        ),
      ),
    );
  }

  static Future<String?> _deviceModel() async {
    try {
      if (kIsWeb) return null;
      final info = DeviceInfoPlugin();
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        return (await info.iosInfo).utsname.machine;
      }
      final a = await info.androidInfo;
      return '${a.manufacturer} ${a.model}';
    } on Object {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final error = _error;
    if (error != null) {
      final denied = error == _CameraError.denied;
      return Scaffold(
        backgroundColor: colors.bg,
        body: SafeArea(
          child: AppStateLayout(
            icon: denied
                ? AppIcons.noPhotographyOutlined
                : AppIcons.videocamOffOutlined,
            tone: AppMedallionTone.danger,
            title: t.t(
              denied
                  ? 'verification.camera.denied.title'
                  : 'verification.camera.unavailable.title',
            ),
            message: t.t(
              denied
                  ? 'verification.camera.denied.body'
                  : 'verification.camera.unavailable.body',
            ),
            action: SizedBox(
              width: AppSizes.stateActionWidth,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (denied) ...[
                    AppButton(
                      label: t.t('verification.idSelfie.openSettings'),
                      height: AppSizes.touchTarget,
                      onPressed: openAppSettingsPage,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  AppButton(
                    label: t.t('common.close'),
                    variant: AppButtonVariant.secondary,
                    height: AppSizes.touchTarget,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final controller = _controller;
    // Security research #5 (2026-10-22), B5: the ID in the viewfinder stays
    // out of screenshots and recordings.
    return SecureScreenScope(
      child: Scaffold(
        backgroundColor: colors.navy,
        body: LayoutBuilder(
          builder: (context, box) {
            final screen = box.biggest;
            _screen = screen;
            final session = _sessionFor(screen);
            return ValueListenableBuilder<bool>(
              valueListenable: session.manual,
              builder: (context, manualFailed, _) => IdSelfieCaptureView(
                t: t,
                preview: controller != null && controller.value.isInitialized
                    ? RepaintBoundary(child: _Preview(controller: controller))
                    : Center(
                        child: CircularProgressIndicator(color: colors.gold),
                      ),
                view: session.view,
                manual: manualFailed || !_detector.available,
                busy: _busy || controller == null,
                shot: _shot,
                onShutter: _onShutter,
                onAnyway: _onAnyway,
                onClose: () => Navigator.of(context).pop(),
                onRetake: _retake,
                onUse: _use,
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) => FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          // A phone's sensor reports landscape; the browser reports the
          // picture as it is (already upright on a phone).
          width: (kIsWeb
                  ? controller.value.previewSize?.width
                  : controller.value.previewSize?.height) ??
              1,
          height: (kIsWeb
                  ? controller.value.previewSize?.height
                  : controller.value.previewSize?.width) ??
              1,
          child: CameraPreview(controller),
        ),
      );
}
