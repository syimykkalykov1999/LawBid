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
import 'package:lawbid/features/calls/presentation/call_stage.dart';
import 'package:lawbid/features/calls/presentation/call_vote.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart'
    show voiceClock;
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';

/// Owner 2026-10-26 — the call screen rebuilt «exactly like WhatsApp»
/// (docs/dev/calls-rework/REFERENCE.md, whatsapp-style.png):
///
/// - Video: the picture covers the whole screen, from under the status bar
///   to the bottom edge (the safe area only keeps the controls clear). 1:1:
///   the other side full screen, our camera a small rounded card that drags
///   and springs to a corner (two taps swap them). Group: rounded tiles
///   with 3 px gaps, the last row stretched; a tap on a tile = that person
///   big with the others in a strip of live cards; a tap on the big one =
///   back to the grid.
/// - Over the picture, no bars: the chevron (minimise), the name and the
///   timer centred with a soft shadow, «+» on the right; at the bottom the
///   dark WhatsApp sheet with round buttons (Flip / Speaker · Video · Mute
///   · End) — pulled up it shows the people and «Add participant».
/// - Video only: one tap anywhere shows / hides the controls; untouched
///   for 4 s they fade away; the grid then takes the whole screen.
/// - Voice: the dark green gradient, a big photo, the name, the timer;
///   group voice: everyone's photo, a green ring on whoever speaks; the
///   sheet never hides.
/// - Ringing here: the photo with soft pulsing rings, Decline · Accept
///   sliding up. Nothing blinks: the name and the timer keep their place,
///   only the status words cross-fade.
class CallScreen extends ConsumerStatefulWidget {
  const CallScreen({super.key});

  @override
  ConsumerState<CallScreen> createState() => _CallScreenState();
}

/// Untouched this long, a video call's controls fade away.
const kCallControlsIdle = Duration(seconds: 4);

class _CallScreenState extends ConsumerState<CallScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
  )..repeat();
  Timer? _tick;
  Timer? _closeTimer;
  Timer? _idle;

  CallPeer? _lastPeer;
  late final CallScreenVisible _visible =
      ref.read(callScreenVisibleProvider.notifier);

  bool _closing = false;

  /// The video call's controls may fade (nothing else needs them now).
  bool _canHide = false;

  /// Closes this screen (the call is over). Once, and only this route.
  void _close() {
    if (!mounted || _closing) return;
    _closing = true;
    final nav = Navigator.of(context);
    final route = ModalRoute.of(context);
    callTrace('screen close: current=${route?.isCurrent} '
        'active=${route?.isActive}');
    if (route == null) {
      unawaited(nav.maybePop());
      return;
    }
    // Owner 2026-10-26 («I hang up and the screen stays»): `maybePop` asks
    // the PopScope, which refuses while a group video has someone big or
    // while it rings. The call is over: the call route goes itself, with
    // any sheet opened over it.
    if (route.isCurrent) {
      nav.pop();
    } else if (route.isActive) {
      nav
        ..popUntil((r) => r == route || r.isFirst)
        ..removeRoute(route);
    }
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
    // The timer's text only (the rest rebuilds on the call's own changes).
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  /// Any touch: the controls stay (or come back) for another 4 s.
  void _touched() {
    _idle?.cancel();
    if (!_canHide) return;
    _idle = Timer(kCallControlsIdle, () {
      if (mounted && _canHide) {
        ref.read(callVideoLayoutProvider.notifier).hideControls();
      }
    });
  }

  /// One tap on the picture: show / hide the controls (video only).
  void _tapPicture() {
    if (!_canHide) return;
    final layout = ref.read(callVideoLayoutProvider.notifier);
    if (ref.read(callVideoLayoutProvider).controlsHidden) {
      layout.showControls();
      _touched();
    } else {
      _idle?.cancel();
      layout.hideControls();
    }
  }

  /// The video / camera button. Owner 2026-10-24: while a crowded call runs
  /// audio only (Cloudflare is down) the camera cannot go on.
  void _videoTap(
    CallController c,
    CallSession s,
    Future<void> Function() toggle,
  ) {
    if (c.videoBlocked && !(s.video && s.cameraOn)) {
      showAppSnackBar(
        context,
        ref.read(translatorProvider).t('call.videoBlocked'),
      );
      return;
    }
    unawaited(toggle());
  }

  /// The red button. Owner 2026-10-26: when nobody else would stay (one
  /// other person, nobody ringing) the call just ends — for both. The host
  /// of a call that goes on without them chooses like in Telegram: end it
  /// for everyone, or leave.
  Future<void> _pressEnd(CallController c, CallSession s) async {
    final call = s.call;
    final me = ref.read(callMyIdProvider);
    final othersIn = call == null
        ? 0
        : call.participants.where((m) => m.joined && m.userId != me).length;
    final ringing = call?.participants.any((m) => m.ringing) ?? false;
    final iHost =
        call != null && call.group && call.hostId != null && call.hostId == me;
    final ask = iHost &&
        (othersIn > 1 || (othersIn == 1 && ringing)) &&
        (s.phase == CallPhase.active || s.phase == CallPhase.connecting);
    callTrace('end pressed ${call?.id} others=$othersIn ringing=$ringing '
        'host=$iHost ask=$ask');
    if (!ask) {
      await c.hangUp(forAll: iHost && othersIn <= 1 && !ringing);
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
                  backgroundColor: AppCallColors.end,
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
  /// mark the first as gone.
  static int _alive = 0;

  @override
  void dispose() {
    _alive--;
    _closeTimer?.cancel();
    _idle?.cancel();
    final visible = _visible;
    Future.microtask(() => visible.set(visible: _alive > 0));
    _pulse.dispose();
    _tick?.cancel();
    super.dispose();
  }

  void _listen(CallController c) {
    ref
      ..listen(callControllerProvider.select((x) => x.phase), (_, phase) {
        _closeTimer?.cancel();
        if (phase == CallPhase.idle) {
          _close();
        } else if (phase == CallPhase.ended) {
          // The 409 sheet (below) decides when this screen goes.
          if (ref.read(callControllerProvider).staleCallId != null) return;
          // «Call ended» stays readable for a moment, then the screen goes.
          _closeTimer = Timer(const Duration(milliseconds: 1500), _close);
        }
      })
      // Telegram: the server holds a call this device does not have.
      ..listen(callControllerProvider.select((x) => x.staleCallId), (_, id) {
        if (id != null && mounted) unawaited(_askEndOther(c));
      })
      // Owner 2026-10-05 (plan builder): the plan has no video calls.
      ..listen(callControllerProvider, (prev, next) {
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
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(callControllerProvider);
    final c = ref.read(callControllerProvider.notifier);
    _listen(c);
    final media = c.media;
    final group = (s.call?.group ?? false) &&
        (s.phase == CallPhase.connecting || s.phase == CallPhase.active);
    if (media == null || group) {
      return _frame(context, s, c, media, group, null, null);
    }
    return ListenableBuilder(
      listenable: Listenable.merge([media.remoteVideo, media.localVideo]),
      builder: (context, _) => _frame(
        context,
        s,
        c,
        media,
        group,
        media.remoteVideo.value,
        media.localVideo.value,
      ),
    );
  }

  Widget _frame(
    BuildContext context,
    CallSession s,
    CallController c,
    CallMediaView? media,
    bool group,
    MediaStream? remoteStream,
    MediaStream? localStream,
  ) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(callMyIdProvider);
    final layout = ref.watch(callVideoLayoutProvider);
    final frontCamera = ref.watch(callFrontCameraProvider);
    // The other member stays on screen until it closes (never a «?»).
    final peer = s.peer ?? s.call?.peer ?? _lastPeer;
    _lastPeer = peer;
    final peerCameraOff = ref.watch(callCamerasOffProvider).contains(peer?.id);
    final active = s.phase == CallPhase.active;
    final incoming = s.phase == CallPhase.incoming;
    final ringing = s.phase == CallPhase.outgoing || incoming;

    // --- 1:1: which picture is big ----------------------------------------
    final peerVideo = remoteStream != null && !peerCameraOff;
    final myVideo = s.cameraOn && localStream != null;
    final oneVideo = s.video && !group && active && (myVideo || peerVideo);
    // Our camera on and theirs not here yet: ours fills the screen.
    final selfBig = myVideo && (layout.selfBig || !peerVideo);
    final bigStream = !oneVideo
        ? null
        : selfBig
            ? localStream
            : (peerVideo ? remoteStream : null);
    final smallStream = !oneVideo
        ? null
        : selfBig
            ? (peerVideo ? remoteStream : null)
            : (myVideo ? localStream : null);
    final groupVideo = group && s.video;
    final videoMode = oneVideo || groupVideo;

    // --- the controls ------------------------------------------------------
    final calm = s.videoPrompt == null &&
        s.notice == null &&
        s.call?.vote == null &&
        !ringing &&
        s.phase != CallPhase.ended;
    final couldHide = videoMode && calm;
    if (couldHide != _canHide) {
      _canHide = couldHide;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (_canHide) {
          _touched();
        } else {
          _idle?.cancel();
          ref.read(callVideoLayoutProvider.notifier).showControls();
        }
      });
    }
    final hidden = _canHide && layout.controlsHidden;
    final safe = MediaQuery.paddingOf(context);
    final sheetHeight = CallControlSheet.closedHeight + safe.bottom;

    // --- the words at the top ---------------------------------------------
    final title = group ? callLabel(s, me) : (peer?.name ?? '');
    final status = _status(t, s);
    // A voice call of two shows the name big in the middle instead.
    final bigCentre = !videoMode && !group;

    Widget picture;
    if (groupVideo) {
      picture = CallGroupGrid(
        session: s,
        media: media,
        controlsInset: hidden ? 0 : sheetHeight,
        onTapBackground: _tapPicture,
      );
    } else if (group) {
      picture = Stack(
        fit: StackFit.expand,
        children: [
          const CallAudioBackdrop(),
          CallGroupAudio(session: s, media: media, bottomInset: sheetHeight),
        ],
      );
    } else if (oneVideo) {
      picture = GestureDetector(
        key: const Key('call-video-bg'),
        behavior: HitTestBehavior.opaque,
        onTap: _tapPicture,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const ColoredBox(color: AppCallColors.stage),
            AnimatedSwitcher(
              duration: context.reduceMotion ? Duration.zero : CallMotion.quick,
              child: bigStream == null
                  ? Center(
                      key: const ValueKey('cam-off'),
                      child: CallAvatar(peer: peer, size: 120),
                    )
                  : CallVideoView(
                      key: ValueKey('big-$selfBig'),
                      stream: bigStream,
                      mirror: callMirrorFor(
                        isLocal: selfBig,
                        frontCamera: frontCamera,
                      ),
                    ),
            ),
          ],
        ),
      );
    } else {
      picture = Stack(
        fit: StackFit.expand,
        children: [
          const CallAudioBackdrop(),
          _BigPerson(
            peer: peer,
            pulse: _pulse,
            ringing: ringing && !context.reduceMotion,
            name: peer?.name ?? '',
            status: status,
            type: type,
            bottomInset: sheetHeight,
          ),
        ],
      );
    }

    final topBar = _TopBar(
      title: bigCentre ? '' : title,
      status: bigCentre ? '' : status,
      type: type,
      onMinimize:
          incoming ? null : () => unawaited(Navigator.of(context).maybePop()),
      onAdd: active ? () => unawaited(showAddToCallPanel(context)) : null,
      minimizeLabel: t.t('call.minimize'),
      addLabel: t.t('call.addParticipant'),
    );

    final banners = <Widget>[
      if (s.notice != null)
        CallNoticeBanner(key: ValueKey(s.notice), notice: s.notice!),
      if (s.videoPrompt != null)
        CallVideoPrompt(
          key: ValueKey(s.videoPrompt),
          name: _promptName(s, peer),
          onTurnOn: () => unawaited(c.toggleVideo()),
          onNotNow: c.dismissVideoPrompt,
        ),
      if (group && s.call?.vote != null)
        CallVoteStrip(vote: s.call!.vote!, call: s.call!),
    ];

    final Widget bottom = incoming
        ? _IncomingButtons(
            video: s.video,
            onDecline: c.decline,
            onAccept: c.accept,
            pulse: _pulse,
          )
        : CallControlSheet(
            translucent: videoMode,
            label: t.t('call.members'),
            panel: const CallMembersPanel(),
            buttons: CallControlBar(
              speaker: s.speaker,
              videoOn: s.video && s.cameraOn,
              muted: s.muted,
              onFlip: s.video && s.cameraOn && s.busy
                  ? () => unawaited(c.switchCamera())
                  : null,
              onSpeaker: s.busy ? () => unawaited(c.toggleSpeaker()) : null,
              // Owner 2026-10-22: switches video on / off mid-call; a
              // channel's video call keeps the plain camera pause.
              onVideo: c.canSwitchVideo
                  ? () => _videoTap(c, s, c.toggleVideo)
                  : s.video && s.busy
                      ? () => _videoTap(c, s, c.toggleCamera)
                      : null,
              onMute: s.busy ? c.toggleMute : null,
              onEnd: s.busy ? () => unawaited(_pressEnd(c, s)) : null,
            ),
          );

    return SystemNavBandColor(
      color: AppCallColors.sheet,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: PopScope(
          // Back minimises a live call (it goes on) — it never drops it. A
          // ringing call stays. One person big: back returns to everyone.
          canPop: !incoming && !(groupVideo && layout.focusId != null),
          onPopInvokedWithResult: (didPop, _) {
            if (!didPop && layout.focusId != null) {
              ref.read(callVideoLayoutProvider.notifier).clearFocus();
            }
          },
          child: Listener(
            behavior: HitTestBehavior.translucent,
            onPointerDown: (_) => _touched(),
            child: Scaffold(
              backgroundColor: AppCallColors.stage,
              body: TweenAnimationBuilder<double>(
                // The screen arrives with a short fade, never a jump cut.
                tween: Tween(begin: 0, end: 1),
                duration: context.reduceMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 220),
                curve: CallMotion.curve,
                builder: (context, v, child) => Opacity(
                  opacity: v,
                  child: Transform.scale(scale: 0.98 + 0.02 * v, child: child),
                ),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Positioned.fill(child: picture),
                    // Our small picture (1:1 video).
                    if (smallStream != null && !layout.pipHidden)
                      Positioned.fill(
                        child: CallPipWindow(
                          stream: smallStream,
                          mirror: callMirrorFor(
                            isLocal: !selfBig,
                            frontCamera: frontCamera,
                          ),
                          topInset: safe.top + 64,
                          bottomInset:
                              hidden ? safe.bottom + 16 : sheetHeight + 12,
                          onTap: _tapPicture,
                          onSwap:
                              ref.read(callVideoLayoutProvider.notifier).swap,
                        ),
                      ),
                    // The top line: chevron, name + timer, «+».
                    PositionedDirectional(
                      top: 0,
                      start: 0,
                      end: 0,
                      child: _Fade(
                        hidden: hidden,
                        offset: const Offset(0, -0.15),
                        child: Padding(
                          padding: EdgeInsets.only(top: safe.top),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              topBar,
                              for (final b in banners)
                                Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    AppSpacing.md,
                                    AppSpacing.sm,
                                    AppSpacing.md,
                                    0,
                                  ),
                                  child: b,
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    // The dark sheet (or Decline · Accept while it rings).
                    PositionedDirectional(
                      start: 0,
                      end: 0,
                      bottom: 0,
                      child: _Fade(
                        hidden: hidden || s.phase == CallPhase.ended,
                        offset: const Offset(0, 0.3),
                        child: bottom,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _promptName(CallSession s, CallPeer? peer) {
    final id = s.videoPrompt;
    if (id == null) return '';
    return s.call?.participants
            .where((m) => m.userId == id)
            .firstOrNull
            ?.name ??
        peer?.name ??
        '';
  }

  /// The line under the name: the running time, or what is happening.
  /// Owner 2026-10-26: never «0:00» or an empty flash — until the call is
  /// up it says what is going on.
  String _status(Translator t, CallSession s) => callStatusText(t, s);
}

/// Slides and fades a part of the call away while it is hidden; it can be
/// touched only while it shows.
class _Fade extends StatelessWidget {
  const _Fade({
    required this.hidden,
    required this.offset,
    required this.child,
  });

  final bool hidden;
  final Offset offset;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final d = context.reduceMotion ? Duration.zero : CallMotion.layout;
    return IgnorePointer(
      ignoring: hidden,
      child: AnimatedSlide(
        offset: hidden ? offset : Offset.zero,
        duration: d,
        curve: CallMotion.curve,
        child: AnimatedOpacity(
          opacity: hidden ? 0 : 1,
          duration: d,
          curve: CallMotion.curve,
          child: child,
        ),
      ),
    );
  }
}

/// WhatsApp's top line over the picture: the chevron (minimise) at the
/// start, the name and the timer in the middle with a soft shadow, «+»
/// at the end. No bar behind it.
class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.title,
    required this.status,
    required this.type,
    required this.onMinimize,
    required this.onAdd,
    required this.minimizeLabel,
    required this.addLabel,
  });

  final String title;
  final String status;
  final AppTypographyTokens type;
  final VoidCallback? onMinimize;
  final VoidCallback? onAdd;
  final String minimizeLabel;
  final String addLabel;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      child: SizedBox(
        height: 52,
        child: Row(
          children: [
            SizedBox(
              width: 48,
              child: onMinimize == null
                  ? null
                  : _TopIcon(
                      icon: AppIcons.expandMoreRounded,
                      label: minimizeLabel,
                      onTap: onMinimize!,
                      plain: true,
                    ),
            ),
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // The name and the status keep their place (both lines
                  // are always laid out), so nothing jumps.
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: type.body.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: CallTextSizes.title,
                      shadows: kCallTextShadow,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Semantics(
                    liveRegion: true,
                    child: Text(
                      status,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: type.caption.copyWith(
                        color: Colors.white.withValues(alpha: 0.9),
                        fontSize: CallTextSizes.status,
                        shadows: kCallTextShadow,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              width: 48,
              child: onAdd == null
                  ? null
                  : _TopIcon(
                      key: const Key('call-btn-add'),
                      icon: AppIcons.personAddAlt1Rounded,
                      label: addLabel,
                      onTap: onAdd!,
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TopIcon extends StatelessWidget {
  const _TopIcon({
    required this.icon,
    required this.label,
    required this.onTap,
    this.plain = false,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  /// No circle behind it (the chevron).
  final bool plain;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: CallPressScale(
          onTap: onTap,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Center(
              child: Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: plain
                      ? Colors.transparent
                      : Colors.black.withValues(alpha: 0.3),
                ),
                child: AppIcon(
                  icon,
                  size: plain ? 28 : 22,
                  color: Colors.white,
                ),
              ),
            ),
          ),
        ),
      );
}

/// A voice call of two (and every call while it rings): the big photo with
/// soft rings while it rings, the name, the status / timer.
class _BigPerson extends StatelessWidget {
  const _BigPerson({
    required this.peer,
    required this.pulse,
    required this.ringing,
    required this.name,
    required this.status,
    required this.type,
    required this.bottomInset,
  });

  final CallPeer? peer;
  final Animation<double> pulse;
  final bool ringing;
  final String name;
  final String status;
  final AppTypographyTokens type;
  final double bottomInset;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top + 56;
    return Padding(
      padding: EdgeInsets.only(top: top, bottom: bottomInset),
      child: Column(
        children: [
          const Spacer(),
          SizedBox(
            width: 220,
            height: 220,
            child: RepaintBoundary(
              child: AnimatedBuilder(
                animation: pulse,
                builder: (context, child) => CustomPaint(
                  painter: _RingsPainter(
                    progress: pulse.value,
                    on: ringing,
                    color: Colors.white,
                  ),
                  child: child,
                ),
                child: Center(child: CallAvatar(peer: peer, size: 132)),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xl),
            child: Text(
              name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: type.body.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: CallTextSizes.bigName,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Semantics(
            liveRegion: true,
            child: AnimatedSwitcher(
              duration: context.reduceMotion ? Duration.zero : CallMotion.quick,
              // Only a change of kind cross-fades (not every second).
              child: Text(
                status,
                key: ValueKey(_kind(status)),
                maxLines: 1,
                textAlign: TextAlign.center,
                style: type.body.copyWith(
                  color: Colors.white.withValues(alpha: 0.8),
                  fontSize: CallTextSizes.bigStatus,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
          const Spacer(flex: 2),
        ],
      ),
    );
  }

  /// The timer's digits change every second; its kind does not.
  static String _kind(String s) =>
      RegExp(r'^\d+:\d\d(:\d\d)?$').hasMatch(s) ? 'clock' : s;
}

/// Decline · Accept, sliding up when the call rings in (WhatsApp); Accept
/// breathes gently.
class _IncomingButtons extends ConsumerWidget {
  const _IncomingButtons({
    required this.video,
    required this.onDecline,
    required this.onAccept,
    required this.pulse,
  });

  final bool video;
  final Future<void> Function() onDecline;
  final Future<void> Function() onAccept;
  final Animation<double> pulse;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final reduce = context.reduceMotion;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: reduce ? Duration.zero : CallMotion.layout,
      curve: CallMotion.curve,
      builder: (context, v, child) => Opacity(
        opacity: v,
        child: Transform.translate(
          offset: Offset(0, 24 * (1 - v)),
          child: child,
        ),
      ),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.xxl,
          0,
          AppSpacing.xxl,
          MediaQuery.paddingOf(context).bottom + AppSpacing.xxl,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            CallRoundButton(
              key: const Key('call-btn-decline'),
              icon: AppIcons.callEndRounded,
              label: t.t('call.decline'),
              caption: t.t('call.decline'),
              fill: AppCallColors.end,
              size: 72,
              onTap: () => unawaited(onDecline()),
            ),
            AnimatedBuilder(
              animation: pulse,
              builder: (context, child) => Transform.scale(
                scale: reduce
                    ? 1
                    : 1 + 0.06 * math.sin(pulse.value * math.pi * 2).abs(),
                child: child,
              ),
              child: CallRoundButton(
                key: const Key('call-btn-accept'),
                icon:
                    video ? AppIcons.videoCameraOutlined : AppIcons.callRounded,
                label: t.t('call.accept'),
                caption: t.t('call.accept'),
                fill: AppCallColors.accept,
                size: 72,
                onTap: () => unawaited(onAccept()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// «Calling…», «0:42», «Busy», «Calls open once the client accepts…».
/// Owner 2026-10-26: never «0:00» or an empty flash — until the call is up
/// (no start time yet) it says «Connecting…».
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
      return at == null
          ? t.t('call.status.connecting')
          : voiceClock(DateTime.now().difference(at));
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
      final outcome = s.outcome ?? CallStatus.ended;
      final text = t.t('call.status.${outcome.name}');
      // Owner 2026-10-26 (WhatsApp): «Call ended · 2:14».
      final from = s.connectedAt;
      final to = s.endedAt;
      if (outcome == CallStatus.ended && from != null && to != null) {
        return '$text · ${voiceClock(to.difference(from))}';
      }
      return text;
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
          ..strokeWidth = 1.5
          ..color = color.withValues(alpha: math.max(0, 0.35 * (1 - p))),
      );
    }
  }

  @override
  bool shouldRepaint(_RingsPainter old) =>
      old.progress != progress || old.on != on;
}
