import 'dart:async';
import 'dart:math' as math;

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
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_add_panel.dart';
import 'package:lawbid/features/calls/presentation/call_controls.dart';
import 'package:lawbid/features/calls/presentation/call_group.dart';
import 'package:lawbid/features/calls/presentation/call_pip_window.dart';
import 'package:lawbid/features/calls/presentation/call_vote.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
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
/// camera in a small window (top corner).
///
/// Owner 2026-10-22 (WhatsApp): one control pill for every call under way —
/// Speaker · Video · Mute · End; the camera flip sits in the top bar while
/// our camera is on. The video button turns a voice call into a video call
/// (and back); when the other side does it, their picture comes up with
/// «Turn on yours?».
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
  Timer? _closeTimer;

  CallPeer? _lastPeer;
  late final CallScreenVisible _visible =
      ref.read(callScreenVisibleProvider.notifier);

  bool _closing = false;

  /// Closes this screen (the call is over). Once, and only this route:
  /// «ended» then «idle» both close, and a second pop while the screen
  /// slides away took the chat under it too (device test 2026-10-21).
  void _close() {
    if (!mounted || _closing) return;
    _closing = true;
    final nav = Navigator.of(context);
    final route = ModalRoute.of(context);
    if (route == null || route.isCurrent) {
      unawaited(nav.maybePop());
    } else if (route.isActive) {
      nav.removeRoute(route);
    }
    // A screen that is still here a moment after the call is over (device
    // test 2026-10-21: frozen, buttons dead) goes regardless.
    Future<void>.delayed(const Duration(milliseconds: 600), () {
      if (!mounted) return;
      final phase = ref.read(callControllerProvider).phase;
      if ((phase == CallPhase.ended || phase == CallPhase.idle) &&
          route != null &&
          route.isActive) {
        nav.removeRoute(route);
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _alive++;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _visible.set(visible: true);
      // Opened (a stale tap) with no call at all: nothing to show.
      if (ref.read(callControllerProvider).phase == CallPhase.idle) _close();
    });
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  /// The red button. In a group call the host chooses like in Telegram:
  /// end it for everyone, or just leave (the others go on, and the host's
  /// rights come back when they return).
  Future<void> _pressEnd(CallController c, CallSession s) async {
    final call = s.call;
    final me = ref.read(callMyIdProvider);
    final othersIn = call == null
        ? 0
        : call.participants.where((m) => m.joined && m.userId != me).length;
    final host = call != null &&
        call.group &&
        call.hostId != null &&
        call.hostId == me &&
        othersIn > 0 &&
        // Also while the links are still being set up (device test
        // 2026-10-21: with four people the host's red button just left).
        (s.phase == CallPhase.active || s.phase == CallPhase.connecting);
    if (!host) {
      await c.hangUp();
      return;
    }
    final t = ref.read(translatorProvider);
    final all = await showAppBottomSheet<bool>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              FilledButton(
                key: const Key('call-end-for-all'),
                style: FilledButton.styleFrom(
                  backgroundColor:
                      Theme.of(ctx).extension<AppColorTokens>()!.danger,
                ),
                onPressed: () => Navigator.of(ctx).pop(true),
                child: Text(t.t('call.endAll')),
              ),
              const SizedBox(height: AppSpacing.sm),
              OutlinedButton(
                key: const Key('call-leave'),
                onPressed: () => Navigator.of(ctx).pop(false),
                child: Text(t.t('call.leave')),
              ),
            ],
          ),
        ),
      ),
    );
    if (all == null) return;
    await c.hangUp(forAll: all);
  }

  Future<void> _askEndOther(CallController c) async {
    final t = ref.read(translatorProvider);
    final end = await showAppBottomSheet<bool>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                t.t('call.inProgress'),
                textAlign: TextAlign.center,
                style: Theme.of(ctx).textTheme.titleMedium,
              ),
              const SizedBox(height: AppSpacing.lg),
              FilledButton(
                key: const Key('call-end-other'),
                onPressed: () => Navigator.of(ctx).pop(true),
                child: Text(t.t('call.end')),
              ),
              TextButton(
                key: const Key('call-end-other-cancel'),
                onPressed: () => Navigator.of(ctx).pop(false),
                child: Text(t.t('common.cancel')),
              ),
            ],
          ),
        ),
      ),
    );
    if (end ?? false) {
      unawaited(c.endOtherDeviceCall());
    } else {
      c.dismissStale();
    }
  }

  /// Call screens alive: a second one closing (a duplicate push) must not
  /// mark the first as gone — the green «return» bar sat over the header
  /// after coming back from picture-in-picture (device test 2026-10-21).
  static int _alive = 0;

  @override
  void dispose() {
    _alive--;
    _closeTimer?.cancel();
    final visible = _visible;
    Future.microtask(() => visible.set(visible: _alive > 0));
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
      _closeTimer?.cancel();
      if (phase == CallPhase.idle) {
        _close();
      } else if (phase == CallPhase.ended) {
        // The 409 sheet (below) decides when this screen goes.
        if (ref.read(callControllerProvider).staleCallId != null) return;
        // "Call ended" stays readable for a moment, then the screen goes.
        _closeTimer = Timer(const Duration(milliseconds: 1500), _close);
      }
    });
    // Telegram: the server holds a call this device does not have — offer
    // to end it there instead of a dead end.
    ref.listen(callControllerProvider.select((x) => x.staleCallId), (_, id) {
      if (id != null && mounted) unawaited(_askEndOther(c));
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
    // The other member stays on screen until it closes (never a "?").
    final peer = s.peer ?? s.call?.peer ?? _lastPeer;
    _lastPeer = peer;
    final me = ref.watch(callMyIdProvider);
    // Owner 2026-10-20: three or more people — everyone as a tile.
    final group = (s.call?.group ?? false) &&
        (s.phase == CallPhase.connecting || s.phase == CallPhase.active);
    final name = group ? callLabel(s, me) : peer?.name ?? '';
    final ringing =
        s.phase == CallPhase.outgoing || s.phase == CallPhase.incoming;
    final media = c.media;
    final layout = ref.watch(callVideoLayoutProvider);
    final peerCameraOff = ref.watch(callCamerasOffProvider).contains(peer?.id);
    final promptId = s.videoPrompt;
    final promptName = promptId == null
        ? ''
        : s.call?.participants
                .where((m) => m.userId == promptId)
                .firstOrNull
                ?.name ??
            peer?.name ??
            '';

    // 1:1: the screen follows the two pictures as they come and go.
    Widget screen(MediaStream? remoteStream, MediaStream? localStream) {
      final peerVideo = remoteStream != null && !peerCameraOff;
      final myVideo = s.cameraOn && localStream != null;
      final videoLive = s.video &&
          !group &&
          s.phase == CallPhase.active &&
          (myVideo || remoteStream != null);
      // Owner 2026-10-22 (WhatsApp): our camera on and theirs not here
      // yet — our own picture fills the screen until theirs arrives.
      final selfBig = myVideo && (layout.selfBig || remoteStream == null);
      // 1:1 video, answered: a tap on the empty screen clears the buttons.
      final hideChrome = layout.controlsHidden && videoLive;
      final smallStream = selfBig
          ? (peerVideo ? remoteStream : null)
          : (myVideo ? localStream : null);
      return _screen(
        context,
        t: t,
        colors: colors,
        type: type,
        s: s,
        c: c,
        peer: peer,
        name: name,
        group: group,
        ringing: ringing,
        media: media,
        layout: layout,
        promptName: promptName,
        videoLive: videoLive,
        selfBig: selfBig,
        hideChrome: hideChrome,
        bigStream: !videoLive
            ? null
            : selfBig
                ? localStream
                : (peerVideo ? remoteStream : null),
        smallStream: videoLive ? smallStream : null,
      );
    }

    if (media == null || group) return screen(null, null);
    return ListenableBuilder(
      listenable: Listenable.merge([media.remoteVideo, media.localVideo]),
      builder: (_, __) =>
          screen(media.remoteVideo.value, media.localVideo.value),
    );
  }

  Widget _screen(
    BuildContext context, {
    required Translator t,
    required AppColorTokens colors,
    required AppTypographyTokens type,
    required CallSession s,
    required CallController c,
    required CallPeer? peer,
    required String name,
    required bool group,
    required bool ringing,
    required CallMedia? media,
    required CallVideoLayout layout,
    required String promptName,
    required bool videoLive,
    required bool selfBig,
    required bool hideChrome,
    required MediaStream? bigStream,
    required MediaStream? smallStream,
  }) {
    return SystemNavBandColor(
      color: colors.navy,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: PopScope(
          // Back minimises a live call (it goes on; the app shows the green
          // "Return to call" bar) — it never drops it. A ringing call stays.
          // In a group video one person big: back returns to everyone first
          // (device test 2026-10-21: it minimised the call).
          canPop: s.phase != CallPhase.incoming &&
              !(group && s.video && layout.focusId != null),
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && layout.focusId != null) {
              ref.read(callVideoLayoutProvider.notifier).clearFocus();
            }
          },
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
                  // The big picture: the other side once theirs arrives (ours
                  // when the small window was tapped, or while theirs is not
                  // here yet); their photo while their camera is off. A tap
                  // on the empty screen hides / shows the controls.
                  if (videoLive)
                    Positioned.fill(
                      child: GestureDetector(
                        key: const Key('call-video-bg'),
                        behavior: HitTestBehavior.opaque,
                        onTap: ref
                            .read(callVideoLayoutProvider.notifier)
                            .toggleControls,
                        child: bigStream == null
                            ? Center(child: CallAvatar(peer: peer, size: 120))
                            : CallVideoView(
                                key: ValueKey(selfBig),
                                stream: bigStream,
                                mirror: selfBig,
                              ),
                      ),
                    ),
                  IgnorePointer(
                    ignoring: hideChrome,
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 160),
                      opacity: hideChrome ? 0 : 1,
                      child: SafeArea(
                        child: Column(
                          children: [
                            // Owner 2026-10-20 (like WhatsApp): minimise on the
                            // left, add a person on the right.
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppSpacing.md,
                                vertical: AppSpacing.sm,
                              ),
                              child: Row(
                                children: [
                                  if (s.phase != CallPhase.incoming)
                                    _TopButton(
                                      icon: AppIcons.expandMoreRounded,
                                      label: t.t('call.minimize'),
                                      onTap: () => unawaited(
                                        Navigator.of(context).maybePop(),
                                      ),
                                    )
                                  else
                                    const SizedBox(width: 44, height: 44),
                                  const Spacer(),
                                  // Owner 2026-10-22 (WhatsApp): the camera
                                  // flip, only while our camera is on.
                                  if (s.video &&
                                      s.cameraOn &&
                                      s.busy &&
                                      s.phase != CallPhase.incoming) ...[
                                    _TopButton(
                                      key: const Key('call-btn-flip'),
                                      icon: AppIcons.cameraRotateOutlined,
                                      label: t.t('call.flipCamera'),
                                      onTap: () => unawaited(c.switchCamera()),
                                    ),
                                    const SizedBox(width: AppSpacing.sm),
                                  ],
                                  // Owner 2026-10-20: the rightmost button
                                  // always sits at the right edge (the same
                                  // inset as the minimise button on the left);
                                  // "add" appears to its left once up.
                                  if (s.phase == CallPhase.active) ...[
                                    _TopButton(
                                      icon: AppIcons.personAddAlt1Rounded,
                                      label: t.t('call.addParticipant'),
                                      onTap: () => unawaited(
                                        showAddToCallPanel(context),
                                      ),
                                    ),
                                    if (group)
                                      const SizedBox(width: AppSpacing.sm),
                                  ],
                                  if (group)
                                    _TopButton(
                                      icon: AppIcons.peopleOutlineRounded,
                                      label: t.t('call.members'),
                                      onTap: () => unawaited(
                                        showCallMembersSheet(context),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppSpacing.screenSide,
                              ),
                              child: Text(
                                name,
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: type.titleLarge
                                    .copyWith(color: Colors.white),
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
                            const SizedBox(height: AppSpacing.xs),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                AppIcon(
                                  AppIcons.lockOutlineRounded,
                                  size: 14,
                                  color: colors.iconTint,
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
                            if (s.notice != null) ...[
                              const SizedBox(height: AppSpacing.sm),
                              CallNoticeBanner(
                                key: ValueKey(s.notice),
                                notice: s.notice!,
                              ),
                            ],
                            if (s.videoPrompt != null) ...[
                              const SizedBox(height: AppSpacing.sm),
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.md,
                                ),
                                child: CallVideoPrompt(
                                  key: ValueKey(s.videoPrompt),
                                  name: promptName,
                                  onTurnOn: () => unawaited(c.toggleVideo()),
                                  onNotNow: c.dismissVideoPrompt,
                                ),
                              ),
                            ],
                            if (group && s.call?.vote != null) ...[
                              const SizedBox(height: AppSpacing.sm),
                              CallVoteStrip(vote: s.call!.vote!, call: s.call!),
                            ],
                            if (group)
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: AppSpacing.md,
                                  ),
                                  child:
                                      CallGroupGrid(session: s, media: media),
                                ),
                              )
                            else
                              const Spacer(),
                            // A live video call: the picture is the background.
                            if (!group && !videoLive)
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
                                  child: Center(
                                    child: CallAvatar(peer: peer, size: 132),
                                  ),
                                ),
                              ),
                            if (!group) const Spacer(),
                            Padding(
                              padding: EdgeInsets.fromLTRB(
                                s.phase == CallPhase.incoming
                                    ? AppSpacing.xl
                                    : AppSpacing.md,
                                0,
                                s.phase == CallPhase.incoming
                                    ? AppSpacing.xl
                                    : AppSpacing.md,
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
                                  : FittedBox(
                                      fit: BoxFit.scaleDown,
                                      child: CallControlBar(
                                        speaker: s.speaker,
                                        videoOn: s.video && s.cameraOn,
                                        muted: s.muted,
                                        onSpeaker: s.busy
                                            ? () => unawaited(c.toggleSpeaker())
                                            : null,
                                        // Owner 2026-10-22: switches video
                                        // on / off mid-call; a channel's
                                        // video call keeps the plain camera
                                        // pause.
                                        onVideo: c.canSwitchVideo
                                            ? () => unawaited(c.toggleVideo())
                                            : s.video && s.busy
                                                ? () =>
                                                    unawaited(c.toggleCamera())
                                                : null,
                                        onMute: s.busy ? c.toggleMute : null,
                                        onEnd: s.busy
                                            ? () => unawaited(_pressEnd(c, s))
                                            : null,
                                      ),
                                    ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  // The other picture, small: drag, swap by a tap, put away.
                  if (smallStream != null && !hideChrome && !layout.pipHidden)
                    Positioned.fill(
                      child: CallPipWindow(
                        stream: smallStream,
                        mirror: !selfBig,
                        topInset:
                            MediaQuery.paddingOf(context).top + AppSpacing.xxl,
                        bottomInset: MediaQuery.paddingOf(context).bottom + 190,
                        onTap: ref.read(callVideoLayoutProvider.notifier).swap,
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

/// A small round button in the call screen's top corners.
class _TopButton extends StatelessWidget {
  const _TopButton({
    required this.icon,
    required this.label,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: colors.callInk.withValues(alpha: 0.14),
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: SizedBox(
            width: 44,
            height: 44,
            child: Center(
              child: AppIcon(icon, size: 24, color: colors.callInk),
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
      if (s.reconnecting) return t.t('call.status.reconnecting');
      final at = s.connectedAt;
      return at == null ? '' : voiceClock(DateTime.now().difference(at));
    case CallPhase.ended:
      switch (s.errorCode) {
        case kMicDenied:
          return t.t('call.micDenied');
        case kRemovedFromCall:
          return t.t('call.removed');
        case kCallUpdateApp:
          return t.t('call.updateApp');
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
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    // Expanded (always a child of a button Row): equal slots, so long
    // translated labels wrap inside their own slot instead of overlapping.
    return Expanded(
      child: Semantics(
        button: true,
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
                child: AppIcon(icon, color: colors.callInk, size: 32),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            FitText(
              label,
              textAlign: TextAlign.center,
              style: type.caption
                  .copyWith(color: colors.callInk.withValues(alpha: 0.85)),
            ),
          ],
        ),
      ),
    );
  }
}
