import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/calls/presentation/call_invite_bar.dart';
import 'package:lawbid/features/calls/presentation/call_rejoin.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart'
    show voiceClock;
import 'package:lawbid/features/chat/chat_routes.dart';

/// OQ-041: opens the call screen over whatever is on screen when a call
/// starts here or rings in (the screen closes itself when it is over).
///
/// Owner 2026-10-20 (like WhatsApp): a call that is minimised stays on top
/// of every screen as a green "Return to call · 0:25" bar; a tap on it, on
/// the call notification, or on a chat's call button during the call opens
/// the call screen again.
class CallHost extends ConsumerWidget {
  const CallHost({required this.router, required this.child, super.key});

  final GoRouter router;
  final Widget child;

  bool _onCallScreen(WidgetRef ref) =>
      ref.read(callScreenVisibleProvider) ||
      router.routerDelegate.currentConfiguration.uri.path == ChatRoutes.call;

  /// The group's own chat shows its «Return» bar itself.
  bool _inChatOf(String groupId) =>
      router.routerDelegate.currentConfiguration.uri.path.contains(groupId);

  /// Answered on the phone's call sheet with the app minimised (device test
  /// 2026-10-21): the push can land while the app is still waking up and the
  /// screen never opens. A moment later, if the call runs and no call screen
  /// is up, open it — the person always lands in the call.
  void _ensureOpen(WidgetRef ref) {
    void open() {
      final s = ref.read(callControllerProvider);
      final talking =
          s.phase == CallPhase.connecting || s.phase == CallPhase.active;
      if (talking && !_onCallScreen(ref)) {
        unawaited(router.push<void>(ChatRoutes.call));
      }
    }

    unawaited(Future<void>.delayed(const Duration(milliseconds: 700), open));
    // Answered while the app was minimised: the app may only now be coming
    // to the front — open the call as soon as it is there.
    if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
      var done = false;
      late final AppLifecycleListener listener;
      void stop() {
        if (done) return;
        done = true;
        listener.dispose();
      }

      listener = AppLifecycleListener(
        onResume: () {
          unawaited(
            Future<void>.delayed(const Duration(milliseconds: 300), open),
          );
          stop();
        },
      );
      unawaited(Future<void>.delayed(const Duration(seconds: 20), stop));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // System call UI answers/declines → the controller.
    ref.watch(callkitEventsProvider);
    // ignore: cascade_invocations
    ref.listen(callControllerProvider.select((s) => s.phase), (prev, next) {
      // A new call opens the screen even during the previous call's
      // "ended" moment.
      final wasLive = prev == CallPhase.outgoing ||
          prev == CallPhase.incoming ||
          prev == CallPhase.connecting ||
          prev == CallPhase.active;
      // Outgoing opens the call screen; an incoming call in the open app is
      // a compact banner (Accept / Decline) until it is answered — then the
      // screen opens, like WhatsApp.
      final opened = (!wasLive &&
              (next == CallPhase.outgoing || next == CallPhase.connecting)) ||
          (prev == CallPhase.incoming && next == CallPhase.connecting);
      if (!opened) return;
      if (!_onCallScreen(ref)) unawaited(router.push<void>(ChatRoutes.call));
      _ensureOpen(ref);
    });
    ref.listen(callOpenRequestProvider, (_, __) {
      if (ref.read(callControllerProvider).busy && !_onCallScreen(ref)) {
        unawaited(router.push<void>(ChatRoutes.call));
      }
    });
    final s = ref.watch(callControllerProvider);
    final screenOpen = ref.watch(callScreenVisibleProvider);
    final talking = s.phase == CallPhase.outgoing ||
        s.phase == CallPhase.connecting ||
        s.phase == CallPhase.active;
    // A video call on screen shrinks to a floating window when the person
    // leaves the app (Android).
    final pip = s.video && talking && screenOpen;
    unawaited(ref.read(callPipProvider).setActive(active: pip));
    final rejoin = ref.watch(groupRejoinProvider);
    final invite = ref.watch(callInviteProvider);
    return ListenableBuilder(
      listenable: router.routerDelegate,
      builder: (context, _) {
        final onScreen = _onCallScreen(ref);
        final Widget? top;
        if (s.phase == CallPhase.incoming &&
            !onScreen &&
            ref.watch(systemRingingCallProvider) != s.call?.id) {
          top = _IncomingBanner(
            session: s,
            onOpen: () => unawaited(router.push<void>(ChatRoutes.call)),
          );
        } else if (talking && !onScreen) {
          top = _ReturnToCallBar(
            session: s,
            onTap: () => unawaited(router.push<void>(ChatRoutes.call)),
          );
        } else if (!s.busy &&
            invite != null &&
            !(invite.groupId != null && _inChatOf(invite.groupId!))) {
          top = CallInviteBar(key: ValueKey(invite.callId), invite: invite);
        } else if (!s.busy &&
            rejoin != null &&
            !(rejoin.groupId != null && _inChatOf(rejoin.groupId!))) {
          top = CallRejoinBar(
            key: ValueKey(rejoin.groupId ?? rejoin.callId),
            rejoin: rejoin,
          );
        } else {
          top = null;
        }
        // The app below keeps one place in the tree whether the bar shows or
        // not: moving `child` between a bare return and a Column remounted
        // the whole navigator under it (a debug `_dependents.isEmpty`
        // assertion on the first call from a chat, device test 2026-10-20).
        // The bar takes the status-bar strip, so what is below it must not
        // pad for the status bar a second time.
        return Column(
          children: [
            if (top != null) top else const SizedBox.shrink(),
            Expanded(
              child: MediaQuery.removePadding(
                context: context,
                removeTop: top != null,
                child: child,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ReturnToCallBar extends ConsumerStatefulWidget {
  const _ReturnToCallBar({required this.session, required this.onTap});

  final CallSession session;
  final VoidCallback onTap;

  @override
  ConsumerState<_ReturnToCallBar> createState() => _ReturnToCallBarState();
}

class _ReturnToCallBarState extends ConsumerState<_ReturnToCallBar> {
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
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final s = widget.session;
    final at = s.connectedAt;
    final back = t.t('call.returnToCall');
    final label = s.phase == CallPhase.active && at != null
        ? '$back · ${voiceClock(DateTime.now().difference(at))}'
        : back;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: colors.success,
        child: InkWell(
          onTap: widget.onTap,
          child: SafeArea(
            bottom: false,
            child: SizedBox(
              height: 30,
              child: Center(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const AppIcon(
                      AppIcons.callRounded,
                      size: 16,
                      color: Colors.white,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      label,
                      style: type.caption.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
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
}

/// An incoming call while the app is open: one compact row at the top
/// (name, Decline, Accept); a tap on the name opens the full call screen.
class _IncomingBanner extends ConsumerWidget {
  const _IncomingBanner({required this.session, required this.onOpen});

  final CallSession session;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = ref.watch(callMyIdProvider);
    final name = callLabel(session, me);
    final call = ref.read(callControllerProvider.notifier);
    Widget round(IconData icon, Color fill, String label, VoidCallback tap) =>
        Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: GestureDetector(
            onTap: tap,
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: fill, shape: BoxShape.circle),
              child: Center(
                child: AppIcon(icon, size: 20, color: Colors.white),
              ),
            ),
          ),
        );
    return Material(
      color: colors.surface,
      elevation: 2,
      child: SafeArea(
        bottom: false,
        child: Container(
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: colors.border)),
          ),
          child: Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: onOpen,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        t.t('call.status.incoming'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              round(
                AppIcons.callEndRounded,
                colors.danger,
                t.t('call.decline'),
                () => unawaited(call.decline()),
              ),
              const SizedBox(width: AppSpacing.md),
              round(
                AppIcons.callRounded,
                colors.success,
                t.t('call.accept'),
                () => unawaited(call.accept()),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
