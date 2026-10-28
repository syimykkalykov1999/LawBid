import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/shared/presentation/qr_code_view.dart';

/// Owner 2026-10-28: true where the guided selfie camera cannot run —
/// the web (Flutter web has no on-device ML Kit, so no liveness check):
/// the selfie step shows «continue on the phone» instead. Overridden in
/// tests.
final selfieNeedsPhoneProvider = Provider<bool>((ref) => kIsWeb);

/// How often the computer re-reads the draft while waiting for the phone.
const selfieHandoffPollInterval = Duration(seconds: 5);

/// Owner 2026-10-28 (docs/architecture/ID_SELFIE_CAPTURE_2026-10-28.md §8):
/// on a computer the selfie step does not dead-end. A QR code (and a «send
/// the link by SMS» button) opens the app on the phone at the wizard,
/// which resumes the same server draft at the selfie step — the licences
/// and ID photos entered here are kept. While this panel is on screen and
/// the page is visible the draft is re-read every 5 s (one small GET);
/// once the phone has attached the selfie, the wizard moves on to the
/// review by itself.
class PhoneHandoffPanel extends ConsumerStatefulWidget {
  const PhoneHandoffPanel({required this.t, super.key});

  final Translator t;

  @override
  ConsumerState<PhoneHandoffPanel> createState() => _PhoneHandoffPanelState();
}

class _PhoneHandoffPanelState extends ConsumerState<PhoneHandoffPanel>
    with WidgetsBindingObserver {
  Timer? _poll;
  bool _polling = false;
  bool _sending = false;
  String? _smsNote;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // The browser tab hidden (or the app in the background): no polling.
    if (state == AppLifecycleState.resumed) {
      _start();
    } else {
      _poll?.cancel();
      _poll = null;
    }
  }

  void _start() {
    _poll ??= Timer.periodic(selfieHandoffPollInterval, (_) => _tick());
  }

  Future<void> _tick() async {
    if (_polling || !mounted) return;
    _polling = true;
    try {
      await ref.read(verificationWizardProvider.notifier).refreshForHandoff();
    } on Object {
      // Offline for a moment: the next tick tries again.
    } finally {
      _polling = false;
    }
  }

  Future<void> _sendSms() async {
    final t = widget.t;
    setState(() {
      _sending = true;
      _smsNote = null;
    });
    String note;
    try {
      final r = await ref
          .read(verificationWizardProvider.notifier)
          .sendSelfieHandoffSms();
      note = r != null && r.sent
          ? t.t('verification.handoff.smsSent', {'last4': r.phoneLast4})
          : t.t('verification.handoff.smsFailed');
    } on ApiException catch (e) {
      note = e.details?['reason'] == 'no_phone'
          ? t.t('verification.handoff.noPhone')
          : t.t('verification.handoff.smsFailed');
    } on Object {
      note = t.t('verification.handoff.smsFailed');
    }
    if (!mounted) return;
    setState(() {
      _sending = false;
      _smsNote = note;
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = widget.t;
    final host = ref.watch(appEnvironmentProvider).deepLinkHost;
    final link = 'https://$host$verificationWizardLocation';
    const qr = AppSpacing.unit * 44; // 176
    final note = _smsNote;
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
            t.t('verification.handoff.title'),
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
          // Scanners need dark dots on a light plate in every theme.
          QrCodeView(
            data: link,
            size: qr,
            dotColor: colors.navy,
            plateColor: colors.surface,
            semanticLabel: t.t('verification.handoff.qr'),
          ),
          const SizedBox(height: AppSpacing.xl),
          SizedBox(
            width: double.infinity,
            child: AppButton(
              key: const ValueKey('selfie-handoff-sms'),
              label: t.t('verification.handoff.sms'),
              variant: AppButtonVariant.secondary,
              icon: AppIcons.phoneIphoneRounded,
              height: AppSizes.touchTarget,
              isLoading: _sending,
              onPressed: _sending ? null : _sendSms,
            ),
          ),
          if (note != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Semantics(
              liveRegion: true,
              child: Text(
                note,
                textAlign: TextAlign.center,
                style: typography.bodySmall.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            ),
          ],
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
      ),
    );
  }
}
