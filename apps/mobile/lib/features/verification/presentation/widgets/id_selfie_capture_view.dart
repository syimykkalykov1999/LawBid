import 'dart:typed_data';

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/verification/domain/selfie_liveness.dart';
import 'package:lawbid/features/verification/presentation/widgets/id_selfie_overlay.dart';

/// Owner 2026-10-28 (ID selfie camera): everything drawn over the live
/// front camera, without the camera itself (the screen passes [preview]),
/// so the widget tests drive it with plain values.
///
/// Live mode: hint line + example animation + instruction at the bottom,
/// the shutter enabled only once the face is in the oval and the liveness
/// prompt is done, «Take photo anyway» after the timeout. Manual mode (no
/// detector): shutter at once. Review mode ([shot] set): Retake / Use.
/// There is no gallery button anywhere: the selfie comes from this camera
/// only.
class IdSelfieCaptureView extends StatelessWidget {
  const IdSelfieCaptureView({
    required this.t,
    required this.preview,
    required this.view,
    required this.manual,
    required this.busy,
    required this.onShutter,
    required this.onAnyway,
    required this.onClose,
    required this.onRetake,
    required this.onUse,
    this.shot,
    super.key,
  });

  final Translator t;
  final Widget preview;
  final ValueListenable<SelfieLivenessView> view;
  final bool manual;
  final bool busy;
  final Uint8List? shot;
  final VoidCallback onShutter;
  final VoidCallback onAnyway;
  final VoidCallback onClose;
  final VoidCallback onRetake;
  final VoidCallback onUse;

  static String hintKey(SelfieHint h) => 'verification.idSelfie.hint.${h.name}';

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final shot = this.shot;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (shot != null)
          Image.memory(shot, fit: BoxFit.cover, gaplessPlayback: true)
        else
          preview,
        ValueListenableBuilder<SelfieLivenessView>(
          valueListenable: view,
          builder: (context, v, _) => IdSelfieOverlay(
            tone: shot != null
                ? OvalTone.ready
                : (manual ? OvalTone.active : v.tone),
            cardDetected: shot != null || v.cardDetected,
            holdProgress: shot != null || manual ? 0 : v.holdProgress,
          ),
        ),
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
                      onPressed: onClose,
                      icon: AppIcon(
                        AppIcons.closeRounded,
                        color: colors.goldLight,
                      ),
                    ),
                    Expanded(
                      child: Text(
                        t.t('verification.idSelfie.title'),
                        textAlign: TextAlign.center,
                        style: typography.body.copyWith(
                          color: colors.goldLight,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSizes.hitTarget),
                  ],
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
                    ? _Review(t: t, onRetake: onRetake, onUse: onUse)
                    : ValueListenableBuilder<SelfieLivenessView>(
                        valueListenable: view,
                        builder: (context, v, _) => _LiveControls(
                          t: t,
                          v: v,
                          manual: manual,
                          busy: busy,
                          onShutter: onShutter,
                          onAnyway: onAnyway,
                        ),
                      ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LiveControls extends StatelessWidget {
  const _LiveControls({
    required this.t,
    required this.v,
    required this.manual,
    required this.busy,
    required this.onShutter,
    required this.onAnyway,
  });

  final Translator t;
  final SelfieLivenessView v;
  final bool manual;
  final bool busy;
  final VoidCallback onShutter;
  final VoidCallback onAnyway;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final hint = manual
        ? t.t('verification.idSelfie.manual')
        : t.t(IdSelfieCaptureView.hintKey(v.hint));
    final enabled = !busy && (manual || v.canCapture);
    final anyway = !manual && !busy && v.showFallback && !v.canCapture;
    final fade = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Semantics(
          liveRegion: true,
          child: AnimatedSwitcher(
            duration: fade,
            child: Text(
              hint,
              key: ValueKey(hint),
              textAlign: TextAlign.center,
              style: typography.titleMedium.copyWith(color: colors.goldLight),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Container(
          padding: const EdgeInsets.all(AppSpacing.sm),
          decoration: BoxDecoration(
            color: colors.navy.withValues(alpha: 0.72),
            borderRadius: BorderRadius.circular(AppRadii.card),
          ),
          child: Row(
            children: [
              IdSelfieExample(
                semanticLabel: t.t('verification.idSelfie.example'),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  t.t('verification.idSelfie.instruction'),
                  style: typography.body.copyWith(color: colors.goldLight),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AnimatedSize(
          duration: fade,
          child: anyway
              ? Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: SizedBox(
                    width: double.infinity,
                    child: AppButton(
                      key: const ValueKey('id-selfie-anyway'),
                      label: t.t('verification.idSelfie.anyway'),
                      icon: AppIcons.photoCameraFrontOutlined,
                      height: AppSizes.touchTarget,
                      onPressed: onAnyway,
                    ),
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
        _Shutter(
          label: t.t('verification.camera.shutter'),
          enabled: enabled,
          busy: busy,
          onTap: onShutter,
        ),
      ],
    );
  }
}

class _Review extends StatelessWidget {
  const _Review({required this.t, required this.onRetake, required this.onUse});

  final Translator t;
  final VoidCallback onRetake;
  final VoidCallback onUse;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          t.t('verification.camera.review'),
          textAlign: TextAlign.center,
          style: typography.body.copyWith(color: colors.goldLight),
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(
              child: AppButton(
                label: t.t('verification.camera.retake'),
                variant: AppButtonVariant.secondary,
                icon: AppIcons.refreshRounded,
                onPressed: onRetake,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AppButton(
                label: t.t('verification.camera.use'),
                icon: AppIcons.checkRounded,
                onPressed: onUse,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// Same shutter as the ID photo camera; dimmed and inert until allowed.
class _Shutter extends StatelessWidget {
  const _Shutter({
    required this.label,
    required this.enabled,
    required this.busy,
    required this.onTap,
  });

  final String label;
  final bool enabled;
  final bool busy;
  final VoidCallback onTap;

  static const double _size = AppSpacing.unit * 18; // 72

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      child: AnimatedOpacity(
        opacity: enabled ? 1 : AppSizes.disabledOpacity,
        duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
        child: AppPressable(
          key: const ValueKey('id-selfie-shutter'),
          onTap: enabled ? onTap : null,
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
      ),
    );
  }
}
