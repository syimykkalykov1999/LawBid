import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

/// Owner 2026-10-26 (exactly like WhatsApp): the round buttons on the dark
/// control sheet, left to right — a video call: Flip · Video · Mute · End;
/// a voice call: Speaker · Video · Mute · End. 60 px circles 16 px apart;
/// a switched-on toggle is white with a dark icon, the others white icons
/// on a light translucent fill, End is the solid red. Each shrinks under
/// the finger with a light tap of haptics; each says what it is to a
/// screen reader.
class CallControlBar extends ConsumerWidget {
  const CallControlBar({
    required this.speaker,
    required this.videoOn,
    required this.muted,
    required this.onSpeaker,
    required this.onVideo,
    required this.onMute,
    required this.onEnd,
    this.onFlip,
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

  /// Set while our camera is on: the first button flips the camera
  /// (WhatsApp's video call) instead of the speaker.
  final VoidCallback? onFlip;

  static const double size = 60;
  static const double gap = 16;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final flip = onFlip;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (flip != null)
          CallRoundButton(
            key: const Key('call-btn-flip'),
            icon: AppIcons.cameraRotateOutlined,
            label: t.t('call.flipCamera'),
            onTap: flip,
          )
        else
          CallRoundButton(
            key: const Key('call-btn-speaker'),
            icon: AppIcons.volumeUpRounded,
            label: t.t('call.speaker'),
            selected: speaker,
            onTap: onSpeaker,
          ),
        const SizedBox(width: gap),
        CallRoundButton(
          key: const Key('call-btn-video'),
          icon: videoOn
              ? AppIcons.videoCameraOutlined
              : AppIcons.videocamOffOutlined,
          label: t.t('call.camera'),
          selected: videoOn,
          onTap: onVideo,
        ),
        const SizedBox(width: gap),
        CallRoundButton(
          key: const Key('call-btn-mute'),
          icon: muted ? AppIcons.micOffRounded : AppIcons.micRounded,
          label: t.t('call.mute'),
          selected: muted,
          onTap: onMute,
        ),
        const SizedBox(width: gap),
        CallRoundButton(
          key: const Key('call-btn-end'),
          icon: AppIcons.callEndRounded,
          label: t.t('call.end'),
          fill: AppCallColors.end,
          onTap: onEnd,
          pressDuration: const Duration(milliseconds: 250),
        ),
      ],
    );
  }
}

/// One round call button (60 px; 72 px with a label under it on the
/// ringing screen).
class CallRoundButton extends StatelessWidget {
  const CallRoundButton({
    required this.icon,
    required this.label,
    required this.onTap,
    this.selected,
    this.fill,
    this.size = CallControlBar.size,
    this.caption,
    this.pressDuration = const Duration(milliseconds: 120),
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onTap;

  /// A toggle's state (null for End / Accept / Decline).
  final bool? selected;

  /// A fixed fill (red End, green Accept).
  final Color? fill;
  final double size;

  /// A word under the circle (the ringing screen).
  final String? caption;
  final Duration pressDuration;

  @override
  Widget build(BuildContext context) {
    final on = selected ?? false;
    final enabled = onTap != null;
    final bg =
        fill ?? (on ? Colors.white : Colors.white.withValues(alpha: 0.16));
    final ink = fill != null || !on ? Colors.white : AppCallColors.sheet;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final circle = Opacity(
      opacity: enabled || fill != null ? 1 : 0.7,
      child: CallPressScale(
        onTap: onTap,
        duration: pressDuration,
        child: AnimatedContainer(
          duration: context.reduceMotion ? Duration.zero : CallMotion.quick,
          width: size,
          height: size,
          decoration: BoxDecoration(shape: BoxShape.circle, color: bg),
          child: AppIcon(icon, color: ink, size: size * 0.43),
        ),
      ),
    );
    return Semantics(
      button: true,
      toggled: selected,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: caption == null
          ? circle
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                circle,
                const SizedBox(height: AppSpacing.sm),
                Text(
                  caption!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(
                    color: Colors.white.withValues(alpha: 0.9),
                    fontSize: CallTextSizes.status,
                  ),
                ),
              ],
            ),
    );
  }
}

/// Owner 2026-10-26 (WhatsApp): the dark sheet at the bottom of a call —
/// a grabber, the round buttons; pulled up (or the grabber tapped) it opens
/// to the people in the call and «Add participant». Closed it is
/// [closedHeight] tall (plus the safe area); the pictures above make room.
class CallControlSheet extends StatefulWidget {
  const CallControlSheet({
    required this.buttons,
    required this.panel,
    required this.translucent,
    required this.label,
    super.key,
  });

  /// What the grabber says to a screen reader («People»).
  final String label;

  final Widget buttons;

  /// What the open sheet shows (people + add).
  final Widget panel;

  /// Over video the sheet lets a little picture through (WhatsApp).
  final bool translucent;

  /// The closed sheet's height above the safe area.
  static const double closedHeight = 108;

  @override
  State<CallControlSheet> createState() => _CallControlSheetState();
}

class _CallControlSheetState extends State<CallControlSheet>
    with SingleTickerProviderStateMixin {
  late final AnimationController _open = AnimationController(
    vsync: this,
    duration: CallMotion.layout,
  );

  @override
  void dispose() {
    _open.dispose();
    super.dispose();
  }

  void _settle({double velocity = 0}) {
    final up = velocity < -300 || (velocity <= 300 && _open.value > 0.5);
    if (context.reduceMotion) {
      _open.value = up ? 1 : 0;
      return;
    }
    if (up) {
      _open.animateTo(1, curve: CallMotion.curve);
    } else {
      _open.animateBack(0, curve: CallMotion.curve);
    }
  }

  @override
  Widget build(BuildContext context) {
    final safe = MediaQuery.paddingOf(context).bottom;
    final maxOpen = MediaQuery.sizeOf(context).height * 0.6;
    const closed = CallControlSheet.closedHeight;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onVerticalDragUpdate: (d) {
        _open.value -= d.delta.dy / (maxOpen - closed);
      },
      onVerticalDragEnd: (d) => _settle(velocity: d.primaryVelocity ?? 0),
      child: AnimatedBuilder(
        animation: _open,
        builder: (context, _) {
          final extra = (maxOpen - closed) * _open.value;
          return Container(
            height: closed + safe + extra,
            decoration: BoxDecoration(
              color: AppCallColors.sheet
                  .withValues(alpha: widget.translucent ? 0.92 : 1),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(22)),
            ),
            child: Column(
              children: [
                Semantics(
                  button: true,
                  label: widget.label,
                  child: GestureDetector(
                    key: const Key('call-sheet-grabber'),
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _open.value > 0.5
                        ? _open.animateBack(0, curve: CallMotion.curve)
                        : _open.animateTo(1, curve: CallMotion.curve),
                    child: SizedBox(
                      height: 24,
                      width: 96,
                      child: Center(
                        child: Container(
                          width: 36,
                          height: 4,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.35),
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                FittedBox(fit: BoxFit.scaleDown, child: widget.buttons),
                if (_open.value > 0)
                  Expanded(
                    child: Opacity(
                      opacity: _open.value,
                      child: Padding(
                        padding: EdgeInsets.only(bottom: safe),
                        child: widget.panel,
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
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
          padding: const EdgeInsetsDirectional.fromSTEB(
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
