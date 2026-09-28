import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/presentation/document_source.dart';
import 'package:lawbid/features/verification/presentation/widgets/capture_guide_overlay.dart';

/// In-app camera for the identity document and the selfie (docs/03 §8
/// steps 3–4 "съёмка", "экран камеры с подсказками"): live preview under
/// a guide frame (card / page / face oval), shutter, then a review of the
/// shot with Retake / Use photo. Pops with a [PickedDocument] or null.
class CameraCaptureScreen extends ConsumerStatefulWidget {
  const CameraCaptureScreen({required this.guide, super.key});

  final CaptureGuide guide;

  @override
  ConsumerState<CameraCaptureScreen> createState() =>
      _CameraCaptureScreenState();
}

enum _CameraError { denied, unavailable }

class _CameraCaptureScreenState extends ConsumerState<CameraCaptureScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  _CameraError? _error;
  bool _busy = false;
  Uint8List? _shot;

  bool get _selfie => widget.guide == CaptureGuide.selfie;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _init();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final c = _controller;
    if (c == null || !c.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      c.dispose();
      _controller = null;
    } else if (state == AppLifecycleState.resumed) {
      _init();
    }
  }

  Future<void> _init() async {
    try {
      final cameras = await availableCameras();
      final wanted =
          _selfie ? CameraLensDirection.front : CameraLensDirection.back;
      final camera =
          cameras.where((c) => c.lensDirection == wanted).firstOrNull ??
              cameras.firstOrNull;
      if (camera == null) {
        if (mounted) setState(() => _error = _CameraError.unavailable);
        return;
      }
      final controller = CameraController(
        camera,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _error = null;
      });
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(
        () => _error = e.code.startsWith('CameraAccess')
            ? _CameraError.denied
            : _CameraError.unavailable,
      );
    }
  }

  Future<void> _takePicture() async {
    final c = _controller;
    if (c == null || _busy || !c.value.isInitialized) return;
    setState(() => _busy = true);
    try {
      final file = await c.takePicture();
      final bytes = await file.readAsBytes();
      if (mounted) setState(() => _shot = bytes);
    } on CameraException {
      if (mounted) setState(() => _error = _CameraError.unavailable);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _use() {
    final bytes = _shot;
    if (bytes == null) return;
    Navigator.of(context).pop(
      PickedDocument(
        name: _selfie ? 'selfie.jpg' : 'document.jpg',
        mime: 'image/jpeg',
        bytes: bytes,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final hint = switch (widget.guide) {
      CaptureGuide.card => t.t('verification.camera.hint.card'),
      CaptureGuide.document => t.t('verification.camera.hint.document'),
      CaptureGuide.selfie => t.t('verification.camera.hint.selfie'),
    };
    final controller = _controller;
    final shot = _shot;

    Widget body;
    if (_error != null) {
      body = AppStateLayout(
        icon: _error == _CameraError.denied
            ? Icons.no_photography_outlined
            : Icons.videocam_off_outlined,
        tone: AppMedallionTone.danger,
        title: t.t(
          _error == _CameraError.denied
              ? 'verification.camera.denied.title'
              : 'verification.camera.unavailable.title',
        ),
        message: t.t(
          _error == _CameraError.denied
              ? 'verification.camera.denied.body'
              : 'verification.camera.unavailable.body',
        ),
        action: SizedBox(
          width: AppSizes.stateActionWidth,
          child: AppButton(
            label: t.t('common.close'),
            variant: AppButtonVariant.secondary,
            height: AppSizes.touchTarget,
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
      );
      return Scaffold(backgroundColor: colors.bg, body: SafeArea(child: body));
    }

    return Scaffold(
      backgroundColor: colors.navy,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (shot != null)
            Image.memory(shot, fit: BoxFit.cover)
          else if (controller != null && controller.value.isInitialized)
            FittedBox(
              fit: BoxFit.cover,
              child: SizedBox(
                width: controller.value.previewSize?.height ?? 1,
                height: controller.value.previewSize?.width ?? 1,
                child: CameraPreview(controller),
              ),
            )
          else
            Center(child: CircularProgressIndicator(color: colors.gold)),
          CaptureGuideOverlay(guide: widget.guide, captured: shot != null),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                    vertical: AppSpacing.xs,
                  ),
                  child: Row(
                    children: [
                      AppIconButton(
                        semanticLabel: t.t('common.close'),
                        onPressed: () => Navigator.of(context).pop(),
                        icon: Icon(
                          Icons.close_rounded,
                          color: colors.goldLight,
                        ),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xl,
                  ),
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      shot != null ? t.t('verification.camera.review') : hint,
                      textAlign: TextAlign.center,
                      style: typography.body.copyWith(color: colors.goldLight),
                    ),
                  ),
                ),
                const Spacer(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    0,
                    AppSpacing.screenSide,
                    AppSpacing.xl,
                  ),
                  child: shot != null
                      ? Row(
                          children: [
                            Expanded(
                              child: AppButton(
                                label: t.t('verification.camera.retake'),
                                variant: AppButtonVariant.secondary,
                                icon: Icons.refresh_rounded,
                                onPressed: () => setState(() => _shot = null),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.md),
                            Expanded(
                              child: AppButton(
                                label: t.t('verification.camera.use'),
                                icon: Icons.check_rounded,
                                onPressed: _use,
                              ),
                            ),
                          ],
                        )
                      : _Shutter(
                          label: t.t('verification.camera.shutter'),
                          busy: _busy,
                          onTap: _takePicture,
                        ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Shutter extends StatelessWidget {
  const _Shutter(
      {required this.label, required this.busy, required this.onTap});

  final String label;
  final bool busy;
  final VoidCallback onTap;

  static const double _size = AppSpacing.unit * 18; // 72

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: label,
      child: AppPressable(
        onTap: busy ? null : onTap,
        child: Container(
          width: _size,
          height: _size,
          padding: const EdgeInsets.all(AppSpacing.xs + 2),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: colors.gold, width: 3),
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: busy ? colors.goldDark : colors.goldLight,
            ),
          ),
        ),
      ),
    );
  }
}
