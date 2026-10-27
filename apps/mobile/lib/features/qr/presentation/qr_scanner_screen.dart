import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/deeplinks/group_invite_handler.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/qr/domain/qr_target.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:url_launcher/url_launcher.dart';

/// `/qr/scan` (owner 2026-10-20, WeChat "Scan"): the camera looks for a QR
/// code; a picture from the gallery works too. Our own codes open in the
/// app (a profile, the website's "Sign in?" question, a group invitation, a
/// case or a post); another web address opens in the browser only after the
/// user confirms; anything else is shown as text.
class QrScannerScreen extends ConsumerStatefulWidget {
  const QrScannerScreen({super.key});

  @override
  ConsumerState<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends ConsumerState<QrScannerScreen> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );

  /// True from the moment a code is taken until the screen is left or the
  /// user dismisses the answer — one scan at a time.
  bool _handling = false;

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handling) return;
    for (final code in capture.barcodes) {
      final raw = code.rawValue;
      if (raw != null && raw.trim().isNotEmpty) {
        unawaited(_handle(raw));
        return;
      }
    }
  }

  Future<void> _pickFromGallery() async {
    if (_handling) return;
    final t = ref.read(translatorProvider);
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (picked == null || !mounted) return;
    BarcodeCapture? capture;
    try {
      capture = await _controller.analyzeImage(
        picked.path,
        formats: const [BarcodeFormat.qrCode],
      );
    } on Object {
      capture = null;
    }
    if (!mounted) return;
    final raw = capture?.barcodes
        .map((b) => b.rawValue)
        .whereType<String>()
        .where((s) => s.trim().isNotEmpty)
        .firstOrNull;
    if (raw == null) {
      showAppSnackBar(context, t.t('qr.scan.none'));
      return;
    }
    await _handle(raw);
  }

  Future<void> _handle(String raw) async {
    _handling = true;
    unawaited(AppHaptics.medium());
    final t = ref.read(translatorProvider);
    final host = ref.read(appEnvironmentProvider).deepLinkHost;
    final target = classifyQr(raw, host: host);
    switch (target) {
      case ProfileQrTarget(:final username):
        context.pushReplacement(AppRoutes.profileByUsername(username));
      case WebLoginQrTarget(:final qrId):
        context.pushReplacement(AppRoutes.webLogin(qrId));
      case AppScreenQrTarget(:final location):
        context.pushReplacement(location);
      case GroupInviteQrTarget(:final token):
        final handler = ref.read(groupInviteHandlerProvider);
        if (handler == null) {
          showAppSnackBar(context, t.t('qr.scan.group'));
          _handling = false;
        } else {
          context.pop();
          handler(token);
        }
      case ExternalUrlQrTarget(:final uri):
        final open = await _confirmOpen(uri);
        if (!mounted) return;
        if (open) {
          try {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          } on Object {
            // Nothing can open it; the scanner stays.
          }
        }
        _handling = false;
      case TextQrTarget(:final text):
        await _showText(text);
        _handling = false;
    }
  }

  Future<bool> _confirmOpen(Uri uri) async {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.read(translatorProvider);
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AppAlertDialog(
        backgroundColor: colors.sheet,
        title: Text(t.t('qr.scan.link')),
        content: Text(
          uri.toString(),
          maxLines: 6,
          overflow: TextOverflow.ellipsis,
          style: typography.body.copyWith(color: colors.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(t.t('cases.files.openBtn')),
          ),
        ],
      ),
    );
    return ok ?? false;
  }

  Future<void> _showText(String text) async {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.read(translatorProvider);
    await showDialog<void>(
      context: context,
      builder: (dialog) => AppAlertDialog(
        backgroundColor: colors.sheet,
        title: Text(t.t('qr.scan.text')),
        content: SelectableText(
          text,
          maxLines: 10,
          style: typography.body.copyWith(color: colors.text),
        ),
        actions: [
          TextButton(
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: text));
              if (dialog.mounted) Navigator.of(dialog).pop();
              if (mounted) showAppSnackBar(context, t.t('share.copied'));
            },
            child: Text(t.t('share.copy')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(),
            child: Text(t.t('common.close')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      // The camera picture is dark in every theme; the controls on it are
      // white, like in every scanner.
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: _onDetect,
            errorBuilder: (context, error) => _CameraProblem(
              message: t.t('qr.scan.denied'),
              retryLabel: t.t('common.retry'),
              onRetry: () => unawaited(_controller.start()),
            ),
          ),
          LayoutBuilder(
            builder: (context, box) {
              final side = (box.maxWidth * 0.7).clamp(200.0, 300.0);
              final window = Rect.fromCenter(
                center: Offset(box.maxWidth / 2, box.maxHeight * 0.42),
                width: side,
                height: side,
              );
              return Stack(
                fit: StackFit.expand,
                children: [
                  IgnorePointer(
                    child: CustomPaint(
                      painter: _ScanFramePainter(
                        window: window,
                        corner: colors.gold,
                      ),
                    ),
                  ),
                  Positioned(
                    left: AppSpacing.screenSide,
                    right: AppSpacing.screenSide,
                    top: window.bottom + AppSpacing.xl,
                    child: Text(
                      t.t('qr.scan.hint'),
                      textAlign: TextAlign.center,
                      style: typography.body.copyWith(color: Colors.white),
                    ),
                  ),
                ],
              );
            },
          ),
          Positioned(
            left: AppSpacing.xs,
            right: AppSpacing.xs,
            top: topInset,
            height: AppSizes.topBar,
            child: Row(
              children: [
                AppIconButton(
                  icon: const AppIcon(
                    AppIcons.arrowBackRounded,
                    color: Colors.white,
                  ),
                  semanticLabel: t.t('common.back'),
                  onPressed: () => context.canPop()
                      ? context.pop()
                      : context.go(AppRoutes.feed),
                ),
                Expanded(
                  child: Text(
                    t.t('qr.scan.title'),
                    textAlign: TextAlign.center,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.titleMedium.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                // Keeps the title centred.
                const SizedBox(width: AppSizes.touchTarget),
              ],
            ),
          ),
          Positioned(
            left: AppSpacing.xl,
            right: AppSpacing.xl,
            bottom: MediaQuery.paddingOf(context).bottom + AppSpacing.xxl,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _RoundAction(
                  key: const ValueKey('scan-gallery'),
                  icon: AppIcons.imageOutlined,
                  label: t.t('reels.pick.gallery'),
                  onTap: _pickFromGallery,
                ),
                ValueListenableBuilder<MobileScannerState>(
                  valueListenable: _controller,
                  builder: (context, state, _) {
                    final on = state.torchState == TorchState.on;
                    return _RoundAction(
                      key: const ValueKey('scan-torch'),
                      icon: AppIcons.flashlight,
                      label: t.t('qr.scan.torch'),
                      selected: on,
                      onTap: state.torchState == TorchState.unavailable
                          ? null
                          : () => unawaited(_controller.toggleTorch()),
                    );
                  },
                ),
                _RoundAction(
                  key: const ValueKey('scan-flip'),
                  icon: AppIcons.cameraRotateOutlined,
                  label: t.t('call.flipCamera'),
                  onTap: () => unawaited(_controller.switchCamera()),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundAction extends StatelessWidget {
  const _RoundAction({
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
    this.selected = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      enabled: onTap != null,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: SizedBox(
          width: 84,
          child: Opacity(
            opacity: onTap == null ? 0.4 : 1,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: selected
                        ? colors.gold
                        : Colors.white.withValues(alpha: 0.18),
                  ),
                  child: SizedBox.square(
                    dimension: 52,
                    child: Center(
                      child: AppIcon(
                        icon,
                        color: selected ? colors.navy : Colors.white,
                        size: AppSizes.iconLg,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  label,
                  maxLines: 2,
                  textAlign: TextAlign.center,
                  overflow: TextOverflow.ellipsis,
                  style: typography.caption.copyWith(color: Colors.white),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CameraProblem extends StatelessWidget {
  const _CameraProblem({
    required this.message,
    required this.retryLabel,
    required this.onRetry,
  });

  final String message;
  final String retryLabel;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return ColoredBox(
      color: Colors.black,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppIcon(AppIcons.scan, color: Colors.white, size: 40),
              const SizedBox(height: AppSpacing.md),
              Text(
                message,
                textAlign: TextAlign.center,
                style: typography.body.copyWith(color: Colors.white),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: retryLabel,
                variant: AppButtonVariant.secondary,
                onPressed: onRetry,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Darkens everything but [window] and draws gold corner brackets on it.
class _ScanFramePainter extends CustomPainter {
  _ScanFramePainter({required this.window, required this.corner});

  final Rect window;
  final Color corner;

  @override
  void paint(Canvas canvas, Size size) {
    final hole = RRect.fromRectAndRadius(window, const Radius.circular(20));
    final dim = Path()
      ..addRect(Offset.zero & size)
      ..addRRect(hole)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(dim, Paint()..color = Colors.black.withValues(alpha: 0.55));

    final p = Paint()
      ..color = corner
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;
    const len = 28.0;
    const r = 20.0;
    final l = window.left;
    final t = window.top;
    final rr = window.right;
    final b = window.bottom;
    final path = Path()
      // top-left
      ..moveTo(l, t + len)
      ..lineTo(l, t + r)
      ..arcToPoint(Offset(l + r, t), radius: const Radius.circular(r))
      ..lineTo(l + len, t)
      // top-right
      ..moveTo(rr - len, t)
      ..lineTo(rr - r, t)
      ..arcToPoint(Offset(rr, t + r), radius: const Radius.circular(r))
      ..lineTo(rr, t + len)
      // bottom-right
      ..moveTo(rr, b - len)
      ..lineTo(rr, b - r)
      ..arcToPoint(Offset(rr - r, b), radius: const Radius.circular(r))
      ..lineTo(rr - len, b)
      // bottom-left
      ..moveTo(l + len, b)
      ..lineTo(l + r, b)
      ..arcToPoint(Offset(l, b - r), radius: const Radius.circular(r))
      ..lineTo(l, b - len);
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(_ScanFramePainter old) =>
      old.window != window || old.corner != corner;
}
