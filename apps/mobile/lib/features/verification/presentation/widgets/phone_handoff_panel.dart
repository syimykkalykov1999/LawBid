import 'dart:async';

import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';
import 'package:lawbid/features/verification/presentation/widgets/inline_notice.dart';
import 'package:lawbid/features/verification/verification_providers.dart';
import 'package:lawbid/shared/presentation/qr_code_view.dart';
import 'package:url_launcher/url_launcher.dart';

/// R-146: false when this device reports no camera at all (a computer
/// without a webcam). An error asking (plugin missing, a phone) counts as
/// «has a camera»: the phones keep the guided camera unchanged.
final selfieCameraAvailableProvider = FutureProvider<bool>((ref) async {
  try {
    return (await availableCameras()).isNotEmpty;
  } on Object {
    return true;
  }
});

/// Owner 2026-10-28 + R-146: true where the guided selfie camera cannot
/// run — the web (Flutter web has no on-device ML Kit, so no liveness
/// check) or a device without a camera: the selfie step shows «continue on
/// the phone» instead. Overridden in tests.
final selfieNeedsPhoneProvider = Provider<bool>(
  (ref) => kIsWeb || ref.watch(selfieCameraAvailableProvider).value == false,
);

/// How often the computer asks whether the phone's selfie arrived
/// (R-146: ≤ every 3 s, stops at done / expired and while hidden).
const selfieHandoffPollInterval = Duration(seconds: 3);

/// R-146: what the phone's link says (null: unknown, another account's, or
/// offline — the phone then still takes the selfie, only without the code).
final selfieHandoffLinkProvider =
    FutureProvider.autoDispose.family<SelfieHandoffStatus?, String>(
  (ref, token) async {
    try {
      return await ref.watch(verificationRepositoryProvider).handoffStatus(
            token,
          );
    } on Object {
      return null;
    }
  },
);

enum _Phase { creating, waiting, expired, failed }

/// Owner 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md §8)
/// and R-146 (owner 2026-11-04): on a computer without a camera the selfie
/// step does not dead-end — the cross-device handoff of Stripe Identity /
/// Onfido. The server makes a one-time code (10 minutes) bound to this
/// request; the QR code and the short link open the app on the phone at
/// the selfie step of THAT request. While this panel is on screen and the
/// page is visible the computer asks the cheap status every 3 s; at
/// `done` it re-reads the draft (the «Далее» button turns on) and shows
/// «Селфи получено ✓»; at `expired` — «Обновить QR».
class PhoneHandoffPanel extends ConsumerStatefulWidget {
  const PhoneHandoffPanel({
    required this.t,
    this.received = false,
    super.key,
  });

  final Translator t;

  /// The draft already has the selfie (the phone sent it).
  final bool received;

  @override
  ConsumerState<PhoneHandoffPanel> createState() => _PhoneHandoffPanelState();
}

class _PhoneHandoffPanelState extends ConsumerState<PhoneHandoffPanel>
    with WidgetsBindingObserver {
  Timer? _poll;
  bool _polling = false;
  bool _visible = true;
  _Phase _phase = _Phase.creating;
  SelfieHandoff? _handoff;
  Object? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    if (!widget.received) unawaited(_create());
  }

  @override
  void didUpdateWidget(PhoneHandoffPanel old) {
    super.didUpdateWidget(old);
    if (widget.received) _stop();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The browser tab hidden (or the app in the background): no polling.
    _visible = state == AppLifecycleState.resumed;
    if (_visible && _phase == _Phase.waiting && !widget.received) {
      _start();
    } else if (!_visible) {
      _stop();
    }
  }

  void _start() {
    _poll ??= Timer.periodic(selfieHandoffPollInterval, (_) => _tick());
  }

  void _stop() {
    _poll?.cancel();
    _poll = null;
  }

  Future<void> _create() async {
    final requestId = ref.read(verificationWizardProvider).value?.request.id;
    if (requestId == null) return;
    _stop();
    setState(() {
      _phase = _Phase.creating;
      _error = null;
    });
    try {
      final h = await ref
          .read(verificationRepositoryProvider)
          .createHandoff(requestId);
      if (!mounted) return;
      setState(() {
        _handoff = h;
        _phase = _Phase.waiting;
      });
      if (_visible) _start();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _Phase.failed;
        _error = e;
      });
    }
  }

  Future<void> _tick() async {
    final h = _handoff;
    if (_polling || !mounted || h == null || widget.received) return;
    _polling = true;
    try {
      final status =
          await ref.read(verificationRepositoryProvider).handoffStatus(h.token);
      if (!mounted) return;
      switch (status) {
        case SelfieHandoffStatus.pending:
          break;
        case SelfieHandoffStatus.done:
          _stop();
          // The draft now has the selfie: «Далее» turns on.
          await ref
              .read(verificationWizardProvider.notifier)
              .refreshForHandoff();
        case SelfieHandoffStatus.expired:
          _stop();
          setState(() => _phase = _Phase.expired);
      }
    } on Object {
      // Offline for a moment: the next tick tries again.
    } finally {
      _polling = false;
    }
  }

  Future<void> _copy(String link) async {
    await Clipboard.setData(ClipboardData(text: link));
    if (mounted) showAppSnackBar(context, widget.t.t('referral.copied'));
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = widget.t;
    const qr = AppSpacing.unit * 44; // 176
    final handoff = _handoff;

    if (widget.received) {
      return Container(
        key: const ValueKey('selfie-handoff-done'),
        padding: const EdgeInsets.all(AppSpacing.xl),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: colors.border),
        ),
        child: Column(
          children: [
            AppIcon(
              AppIcons.checkCircleRounded,
              size: AppSizes.iconLg,
              color: colors.success,
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('verification.handoff.done'),
              textAlign: TextAlign.center,
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
          ],
        ),
      );
    }

    final code = switch (_phase) {
      _Phase.creating => const AppSkeleton(width: qr, height: qr),
      _Phase.waiting when handoff != null => QrCodeView(
          // Scanners need dark dots on a light plate in every theme.
          data: handoff.url,
          size: qr,
          dotColor: colors.navy,
          plateColor: colors.surface,
          semanticLabel: t.t('verification.handoff.qr'),
        ),
      _ => Column(
          key: const ValueKey('selfie-handoff-expired'),
          children: [
            Text(
              _phase == _Phase.failed && _error != null
                  ? errorText(t, _error!)
                  : t.t('verification.handoff.expired'),
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('selfie-handoff-refresh'),
              label: t.t('verification.handoff.refresh'),
              icon: AppIcons.refreshRounded,
              variant: AppButtonVariant.secondary,
              onPressed: () => unawaited(_create()),
            ),
          ],
        ),
    };

    return Container(
      key: const ValueKey('selfie-phone-handoff'),
      padding: const EdgeInsets.all(AppSpacing.xl),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          Text(
            t.t('verification.handoff.noCameraTitle'),
            textAlign: TextAlign.center,
            style: typography.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            t.t('verification.handoff.body'),
            textAlign: TextAlign.center,
            style: typography.body.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xl),
          code,
          if (_phase == _Phase.waiting && handoff != null) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  child: SelectableText(
                    handoff.url,
                    key: const ValueKey('selfie-handoff-link'),
                    textAlign: TextAlign.center,
                    style: typography.bodySmall.copyWith(color: colors.text),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                TextButton.icon(
                  key: const ValueKey('selfie-handoff-copy'),
                  onPressed: () => unawaited(_copy(handoff.url)),
                  icon: const AppIcon(
                    AppIcons.copyOutlined,
                    size: AppSizes.iconSm,
                  ),
                  label: Text(t.t('partner.copy')),
                ),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          Text(
            t.t('verification.handoff.orSignIn'),
            key: const ValueKey('selfie-handoff-sign-in-hint'),
            textAlign: TextAlign.center,
            style: typography.body.copyWith(color: colors.textSecondary),
          ),
          if (_phase == _Phase.waiting) ...[
            const SizedBox(height: AppSpacing.lg),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // A still icon, not a spinner: nothing ticks while waiting.
                AppIcon(
                  AppIcons.hourglassTopRounded,
                  size: AppSizes.iconSm,
                  color: colors.gold,
                ),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Text(
                    t.t('verification.handoff.waiting'),
                    style: typography.bodySmall.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// R-146: the phone opened the computer's link (`…/selfie/<token>`). Before the
/// selfie: nothing (the camera card below), or why the link no longer
/// works; on a device that cannot take the selfie itself (a phone browser
/// without the app) — «open the app». After the selfie: «Готово,
/// вернитесь на компьютер».
class HandoffPhoneNotice extends ConsumerWidget {
  const HandoffPhoneNotice({
    required this.t,
    required this.token,
    required this.received,
    required this.needsApp,
    super.key,
  });

  final Translator t;
  final String token;
  final bool received;
  final bool needsApp;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (received) {
      return InlineNotice(
        key: const ValueKey('selfie-handoff-phone-done'),
        tone: NoticeTone.success,
        icon: AppIcons.checkCircleRounded,
        message: t.t('verification.handoff.phoneDone'),
      );
    }
    if (needsApp) {
      return InlineNotice(
        key: const ValueKey('selfie-handoff-needs-app'),
        tone: NoticeTone.info,
        icon: AppIcons.smartphoneRounded,
        message: t.t('verification.handoff.needsApp'),
        action: AppButton(
          key: const ValueKey('selfie-handoff-open-app'),
          label: t.t('qr.link.open'),
          onPressed: () => unawaited(
            launchUrl(
              Uri(scheme: 'lawbid', host: 'selfie', path: '/$token'),
              mode: LaunchMode.externalApplication,
            ).catchError((_) => false),
          ),
        ),
      );
    }
    final status = ref.watch(selfieHandoffLinkProvider(token));
    if (status.isLoading || status.value == SelfieHandoffStatus.pending) {
      return const SizedBox.shrink();
    }
    if (status.value == SelfieHandoffStatus.done) {
      return InlineNotice(
        key: const ValueKey('selfie-handoff-phone-done'),
        tone: NoticeTone.success,
        icon: AppIcons.checkCircleRounded,
        message: t.t('verification.handoff.phoneDone'),
      );
    }
    return InlineNotice(
      key: const ValueKey('selfie-handoff-link-invalid'),
      tone: NoticeTone.warning,
      icon: AppIcons.linkOffRounded,
      message: t.t('verification.handoff.linkInvalid'),
    );
  }
}
