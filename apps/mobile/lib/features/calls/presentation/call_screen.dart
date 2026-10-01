import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart'
    show voiceClock;

/// OQ-041: the full-screen call — navy with gold, the other member's
/// photo with pulsing rings while it rings, the status or the running
/// time, and round buttons (Mute · End · Speaker; Decline · Accept when it
/// rings here). Closes itself when the call is over.
class CallScreen extends ConsumerStatefulWidget {
  const CallScreen({super.key});

  @override
  ConsumerState<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends ConsumerState<CallScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat();
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _pulse.dispose();
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final s = ref.watch(callControllerProvider);
    final c = ref.read(callControllerProvider.notifier);
    ref.listen(callControllerProvider.select((x) => x.phase), (_, phase) {
      if (phase == CallPhase.idle && mounted) {
        Navigator.of(context).maybePop();
      }
    });
    final peer = s.peer ?? s.call?.peer;
    final name = peer?.name ?? '';
    final ringing =
        s.phase == CallPhase.outgoing || s.phase == CallPhase.incoming;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: PopScope(
        // Back never drops a live call by accident.
        canPop: !s.busy,
        child: Scaffold(
          backgroundColor: colors.navy,
          body: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  colors.navy,
                  Color.lerp(colors.navy, Colors.black, 0.55)!,
                ],
              ),
            ),
            child: SafeArea(
              child: Column(
                children: [
                  const SizedBox(height: AppSpacing.lg),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AppIcon(AppIcons.lockOutlineRounded,
                          size: 14, color: colors.goldLight),
                      const SizedBox(width: AppSpacing.xs),
                      Text(
                        t.t('call.audioOnly'),
                        style: type.caption.copyWith(color: colors.goldLight),
                      ),
                    ],
                  ),
                  const Spacer(flex: 2),
                  SizedBox(
                    width: 220,
                    height: 220,
                    child: AnimatedBuilder(
                      animation: _pulse,
                      builder: (context, child) => CustomPaint(
                        painter: _RingsPainter(
                          progress: _pulse.value,
                          on: ringing && !context.reduceMotion,
                          color: colors.gold,
                        ),
                        child: child,
                      ),
                      child: Center(child: _Avatar(peer: peer, size: 132)),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.screenSide),
                    child: Text(
                      name,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.titleLarge.copyWith(color: Colors.white),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Semantics(
                    liveRegion: true,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.screenSide),
                      child: Text(
                        callStatusText(t, s),
                        textAlign: TextAlign.center,
                        style: type.body.copyWith(
                          color: s.phase == CallPhase.active
                              ? colors.goldLight
                              : Colors.white.withValues(alpha: 0.75),
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ),
                  const Spacer(flex: 3),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                        AppSpacing.xl, 0, AppSpacing.xl, AppSpacing.xxl),
                    child: s.phase == CallPhase.incoming
                        ? Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _RoundButton(
                                icon: AppIcons.callEndRounded,
                                label: t.t('call.decline'),
                                color: colors.danger,
                                onTap: c.decline,
                              ),
                              _RoundButton(
                                icon: AppIcons.callRounded,
                                label: t.t('call.accept'),
                                color: colors.success,
                                onTap: c.accept,
                              ),
                            ],
                          )
                        : Row(
                            mainAxisAlignment: MainAxisAlignment.spaceAround,
                            children: [
                              _RoundButton(
                                icon: s.muted
                                    ? AppIcons.micOffRounded
                                    : AppIcons.micRounded,
                                label: t.t('call.mute'),
                                color: Colors.white
                                    .withValues(alpha: s.muted ? 0.9 : 0.14),
                                iconColor: s.muted ? colors.navy : Colors.white,
                                selected: s.muted,
                                onTap: s.busy ? c.toggleMute : null,
                              ),
                              _RoundButton(
                                icon: AppIcons.callEndRounded,
                                label: t.t('call.end'),
                                color: colors.danger,
                                onTap: s.busy ? c.hangUp : null,
                              ),
                              _RoundButton(
                                icon: AppIcons.volumeUpRounded,
                                label: t.t('call.speaker'),
                                color: Colors.white
                                    .withValues(alpha: s.speaker ? 0.9 : 0.14),
                                iconColor:
                                    s.speaker ? colors.navy : Colors.white,
                                selected: s.speaker,
                                onTap: s.busy ? c.toggleSpeaker : null,
                              ),
                            ],
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "Calling…", "0:42", "Busy", "Calls open once the client accepts…".
String callStatusText(Translator t, CallSession s) {
  switch (s.phase) {
    case CallPhase.outgoing:
      return t.t('call.status.calling');
    case CallPhase.incoming:
      return t.t('call.status.incoming');
    case CallPhase.connecting:
      return t.t('call.status.connecting');
    case CallPhase.active:
      final at = s.connectedAt;
      return at == null ? '' : voiceClock(DateTime.now().difference(at));
    case CallPhase.ended:
      switch (s.errorCode) {
        case 'CALL_NOT_ALLOWED':
          return t.t('call.notAllowed');
        case 'SUBSCRIPTION_REQUIRED':
          return t.t('call.subscription');
        case 'CALL_IN_PROGRESS':
          return t.t('call.inProgress');
      }
      return t.t('call.status.${(s.outcome ?? CallStatus.ended).name}');
    case CallPhase.idle:
      return '';
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.peer, required this.size});

  final CallPeer? peer;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final url = peer?.avatarUrl;
    final initials = (peer?.name ?? '?')
        .replaceAll('@', '')
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
            : Image.network(url, fit: BoxFit.cover),
      ),
    );
  }
}

class _RingsPainter extends CustomPainter {
  _RingsPainter({
    required this.progress,
    required this.on,
    required this.color,
  });

  final double progress;
  final bool on;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (!on) return;
    final center = size.center(Offset.zero);
    final maxR = size.width / 2;
    for (var i = 0; i < 3; i++) {
      final p = (progress + i / 3) % 1.0;
      canvas.drawCircle(
        center,
        maxR * (0.62 + 0.38 * p),
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = color.withValues(alpha: math.max(0, 0.55 * (1 - p))),
      );
    }
  }

  @override
  bool shouldRepaint(_RingsPainter old) =>
      old.progress != progress || old.on != on;
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
    this.iconColor = Colors.white,
    this.selected,
  });

  final IconData icon;
  final String label;
  final Color color;
  final Color iconColor;
  final VoidCallback? onTap;
  final bool? selected;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      toggled: selected,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AppPressable(
            onTap: () {
              if (onTap == null) return;
              HapticFeedback.lightImpact();
              onTap!();
            },
            child: AnimatedContainer(
              duration:
                  context.reduceMotion ? Duration.zero : AppMotion.stateChange,
              width: 72,
              height: 72,
              decoration: BoxDecoration(shape: BoxShape.circle, color: color),
              child: AppIcon(icon, color: iconColor, size: 32),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            label,
            style: type.caption
                .copyWith(color: Colors.white.withValues(alpha: 0.85)),
          ),
        ],
      ),
    );
  }
}
