import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// Owner 2026-10-22 (WhatsApp): the buttons of a call that is under way —
/// one dark rounded pill with, left to right, Speaker · Video · Mute · End.
/// Icons only (WhatsApp); every button says what it is to a screen reader.
/// A switched-on toggle is filled with the light ink; the off camera and the
/// muted microphone show their slashed icons.
class CallControlBar extends ConsumerWidget {
  const CallControlBar({
    required this.speaker,
    required this.videoOn,
    required this.muted,
    required this.onSpeaker,
    required this.onVideo,
    required this.onMute,
    required this.onEnd,
    super.key,
  });

  final bool speaker;

  /// Our camera is sending.
  final bool videoOn;
  final bool muted;

  /// Null = not available now (still connecting, a channel's voice call).
  final VoidCallback? onSpeaker;
  final VoidCallback? onVideo;
  final VoidCallback? onMute;
  final VoidCallback? onEnd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.callPill,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _PillButton(
              key: const Key('call-btn-speaker'),
              icon: AppIcons.volumeUpRounded,
              label: t.t('call.speaker'),
              selected: speaker,
              onTap: onSpeaker,
            ),
            _PillButton(
              key: const Key('call-btn-video'),
              icon: videoOn
                  ? AppIcons.videoCameraOutlined
                  : AppIcons.videocamOffOutlined,
              label: t.t('call.camera'),
              selected: videoOn,
              onTap: onVideo,
            ),
            _PillButton(
              key: const Key('call-btn-mute'),
              icon: muted ? AppIcons.micOffRounded : AppIcons.micRounded,
              label: t.t('call.mute'),
              selected: muted,
              onTap: onMute,
            ),
            _PillButton(
              key: const Key('call-btn-end'),
              icon: AppIcons.callEndRounded,
              label: t.t('call.end'),
              fill: colors.danger,
              onTap: onEnd,
            ),
          ],
        ),
      ),
    );
  }
}

class _PillButton extends StatelessWidget {
  const _PillButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.selected,
    this.fill,
    super.key,
  });

  static const double size = 56;

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  /// A toggle's state (null for the end button).
  final bool? selected;

  /// A fixed fill (the red end button).
  final Color? fill;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final on = selected ?? false;
    final enabled = onTap != null;
    final bg = fill ?? colors.callInk.withValues(alpha: on ? 0.92 : 0.12);
    final ink = fill != null || !on ? colors.callInk : colors.navy;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: Semantics(
        button: true,
        toggled: selected,
        enabled: enabled,
        label: label,
        excludeSemantics: true,
        child: Opacity(
          opacity: enabled ? 1 : 0.4,
          child: AppPressable(
            onTap: () {
              if (onTap == null) return;
              HapticFeedback.lightImpact();
              onTap!();
            },
            child: AnimatedContainer(
              duration:
                  context.reduceMotion ? Duration.zero : AppMotion.stateChange,
              width: size,
              height: size,
              decoration: BoxDecoration(shape: BoxShape.circle, color: bg),
              child: AppIcon(icon, color: ink, size: 26),
            ),
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-22 (WhatsApp): «{name} turned on video. Turn on yours?»
/// with «Turn on» / «Not now» — shown once each time someone switches a
/// camera on while ours is off.
class CallVideoPrompt extends ConsumerWidget {
  const CallVideoPrompt({
    required this.name,
    required this.onTurnOn,
    required this.onNotNow,
    super.key,
  });

  final String name;
  final VoidCallback onTurnOn;
  final VoidCallback onNotNow;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      liveRegion: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.callPill,
          borderRadius: BorderRadius.circular(AppRadii.card),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.md,
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.sm,
          ),
          child: Row(
            children: [
              AppIcon(
                AppIcons.videoCameraOutlined,
                size: 20,
                color: colors.callInk,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t('call.videoPrompt', {'name': name}),
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.callInk),
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              Flexible(
                child: TextButton(
                  key: const Key('call-video-prompt-later'),
                  style: TextButton.styleFrom(foregroundColor: colors.callInk),
                  onPressed: onNotNow,
                  child: FitText(t.t('call.videoNotNow')),
                ),
              ),
              Flexible(
                child: FilledButton(
                  key: const Key('call-video-prompt-on'),
                  style: FilledButton.styleFrom(
                    backgroundColor: colors.success,
                    foregroundColor: colors.callInk,
                  ),
                  onPressed: onTurnOn,
                  child: FitText(t.t('call.videoTurnOn')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
