import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart'
    show voiceClock;
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';

/// OQ-041: the full-screen call — navy with gold, the other member's
/// photo with pulsing rings while it rings, the status or the running
/// time, and round buttons (Mute · End · Speaker; Decline · Accept when it
/// rings here). Closes itself when the call is over.
///
/// Owner 2026-10-05: a video call shows the other side full screen and our
/// camera in a small window (top corner); buttons Mute · Camera · End ·
/// Flip camera.
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
    // Owner 2026-10-05 (plan builder): the plan has no video calls — the
    // call screen gives way to the plans.
    ref.listen(callControllerProvider, (prev, next) {
      if (prev?.phase == CallPhase.ended ||
          next.phase != CallPhase.ended ||
          next.errorCode != ApiErrorCodes.entitlementRequired ||
          !mounted) {
        return;
      }
      final router = GoRouter.of(context);
      final path = planOfferPath(
        ref.read(currentUserRoleProvider),
        PaywallReason.videoCall,
      );
      Navigator.of(context).maybePop();
      unawaited(router.push(path));
    });
    final peer = s.peer ?? s.call?.peer;
    final name = peer?.name ?? '';
    final ringing =
        s.phase == CallPhase.outgoing || s.phase == CallPhase.incoming;
    final media = c.media;
    final remote = s.video ? media?.remoteVideo : null;
    final local = s.video ? media?.localVideo : null;

    return SystemNavBandColor(
      color: colors.navy,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
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
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // The other side, full screen, once their picture arrives.
                  if (remote != null)
                    ValueListenableBuilder<MediaStream?>(
                      valueListenable: remote,
                      builder: (_, stream, __) =>
                          stream == null || s.phase != CallPhase.active
                              ? const SizedBox.shrink()
                              : CallVideoView(stream: stream),
                    ),
                  SafeArea(
                    child: Column(
                      children: [
                        const SizedBox(height: AppSpacing.lg),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            AppIcon(
                              AppIcons.lockOutlineRounded,
                              size: 14,
                              color: colors.goldLight,
                            ),
                            const SizedBox(width: AppSpacing.xs),
                            Flexible(
                              child: Text(
                                t.t(
                                  s.video
                                      ? 'call.videoLabel'
                                      : 'call.audioOnly',
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: type.caption
                                    .copyWith(color: colors.goldLight),
                              ),
                            ),
                          ],
                        ),
                        const Spacer(flex: 2),
                        // A live video call: the picture is the background.
                        if (!(s.video && s.phase == CallPhase.active))
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
                              child:
                                  Center(child: _Avatar(peer: peer, size: 132)),
                            ),
                          ),
                        const SizedBox(height: AppSpacing.xl),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: AppSpacing.screenSide,
                          ),
                          child: Text(
                            name,
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style:
                                type.titleLarge.copyWith(color: Colors.white),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Semantics(
                          liveRegion: true,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.screenSide,
                            ),
                            child: Text(
                              callStatusText(t, s),
                              textAlign: TextAlign.center,
                              style: type.body.copyWith(
                                color: s.phase == CallPhase.active
                                    ? colors.goldLight
                                    : Colors.white.withValues(alpha: 0.75),
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                          ),
                        ),
                        const Spacer(flex: 3),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(
                            AppSpacing.xl,
                            0,
                            AppSpacing.xl,
                            AppSpacing.xxl,
                          ),
                          child: s.phase == CallPhase.incoming
                              ? Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceAround,
                                  children: [
                                    _RoundButton(
                                      icon: AppIcons.callEndRounded,
                                      label: t.t('call.decline'),
                                      color: colors.danger,
                                      onTap: c.decline,
                                    ),
                                    _RoundButton(
                                      icon: s.video
                                          ? AppIcons.videoCameraOutlined
                                          : AppIcons.callRounded,
                                      label: t.t('call.accept'),
                                      color: colors.success,
                                      onTap: c.accept,
                                    ),
                                  ],
                                )
                              : Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.spaceAround,
                                  children: [
                                    _RoundButton(
                                      icon: s.muted
                                          ? AppIcons.micOffRounded
                                          : AppIcons.micRounded,
                                      label: t.t('call.mute'),
                                      color: Colors.white.withValues(
                                        alpha: s.muted ? 0.9 : 0.14,
                                      ),
                                      iconColor:
                                          s.muted ? colors.navy : Colors.white,
                                      selected: s.muted,
                                      onTap: s.busy ? c.toggleMute : null,
                                    ),
                                    _RoundButton(
                                      icon: AppIcons.callEndRounded,
                                      label: t.t('call.end'),
                                      color: colors.danger,
                                      onTap: s.busy ? c.hangUp : null,
                                    ),
                                    if (s.video) ...[
                                      _RoundButton(
                                        icon: s.cameraOn
                                            ? AppIcons.videoCameraOutlined
                                            : AppIcons.videocamOffOutlined,
                                        label: t.t('call.camera'),
                                        color: Colors.white.withValues(
                                          alpha: s.cameraOn ? 0.14 : 0.9,
                                        ),
                                        iconColor: s.cameraOn
                                            ? Colors.white
                                            : colors.navy,
                                        selected: !s.cameraOn,
                                        onTap: s.busy ? c.toggleCamera : null,
                                      ),
                                      _RoundButton(
                                        icon: AppIcons.cameraRotateOutlined,
                                        label: t.t('call.flipCamera'),
                                        color: Colors.white
                                            .withValues(alpha: 0.14),
                                        onTap: s.busy && s.cameraOn
                                            ? c.switchCamera
                                            : null,
                                      ),
                                    ] else
                                      _RoundButton(
                                        icon: AppIcons.volumeUpRounded,
                                        label: t.t('call.speaker'),
                                        color: Colors.white.withValues(
                                          alpha: s.speaker ? 0.9 : 0.14,
                                        ),
                                        iconColor: s.speaker
                                            ? colors.navy
                                            : Colors.white,
                                        selected: s.speaker,
                                        onTap: s.busy ? c.toggleSpeaker : null,
                                      ),
                                  ],
                                ),
                        ),
                      ],
                    ),
                  ),
                  // Our camera, small, in the top corner.
                  if (local != null)
                    ValueListenableBuilder<MediaStream?>(
                      valueListenable: local,
                      builder: (_, stream, __) => stream == null || !s.cameraOn
                          ? const SizedBox.shrink()
                          : PositionedDirectional(
                              top: MediaQuery.paddingOf(context).top +
                                  AppSpacing.xxl,
                              end: AppSpacing.md,
                              width: 104,
                              height: 156,
                              child: ClipRRect(
                                borderRadius:
                                    BorderRadius.circular(AppRadii.card),
                                child:
                                    CallVideoView(stream: stream, mirror: true),
                              ),
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

/// Owner 2026-10-05: one WebRTC picture (ours mirrored, like a mirror).
class CallVideoView extends StatefulWidget {
  const CallVideoView({required this.stream, this.mirror = false, super.key});

  final MediaStream stream;
  final bool mirror;

  @override
  State<CallVideoView> createState() => _CallVideoViewState();
}

class _CallVideoViewState extends State<CallVideoView> {
  final _renderer = RTCVideoRenderer();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _renderer.initialize();
    if (!mounted) {
      await _renderer.dispose();
      return;
    }
    _renderer.srcObject = widget.stream;
    // Web: the call's sound already plays through CallMedia.
    if (kIsWeb) _renderer.muted = true;
    setState(() => _ready = true);
  }

  @override
  void didUpdateWidget(CallVideoView old) {
    super.didUpdateWidget(old);
    if (_ready && old.stream != widget.stream) {
      _renderer.srcObject = widget.stream;
      if (kIsWeb) _renderer.muted = true;
    }
  }

  @override
  void dispose() {
    _renderer
      ..srcObject = null
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => !_ready
      ? const ColoredBox(color: Colors.black)
      : RTCVideoView(
          _renderer,
          mirror: widget.mirror,
          objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
        );
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
        case ApiErrorCodes.entitlementRequired:
          return t.t('paywall.videoCall.title');
        // Audit 2026-10-02: the other refusals the server sends.
        case 'ASSISTANT_NOT_ALLOWED':
        case 'USER_BLOCKED':
        case 'CONVERSATION_CLOSED':
        case 'CALL_STATE_CONFLICT':
        case 'CALL_NOT_FOUND':
          return t.t('error.api.${s.errorCode}');
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
    // Expanded (always a child of a button Row): equal slots, so long
    // translated labels wrap inside their own slot instead of overlapping.
    return Expanded(
      child: Semantics(
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
                duration: context.reduceMotion
                    ? Duration.zero
                    : AppMotion.stateChange,
                width: 72,
                height: 72,
                decoration: BoxDecoration(shape: BoxShape.circle, color: color),
                child: AppIcon(icon, color: iconColor, size: 32),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            FitText(
              label,
              textAlign: TextAlign.center,
              style: type.caption
                  .copyWith(color: Colors.white.withValues(alpha: 0.85)),
            ),
          ],
        ),
      ),
    );
  }
}
