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
import 'package:lawbid/features/calls/presentation/call_pip_window.dart';
import 'package:lawbid/features/calls/presentation/call_screen.dart'
    show callStatusText;
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/features/chat/chat_routes.dart';

/// OQ-041: opens the call screen over whatever is on screen when a call
/// starts here or rings in (the screen closes itself when it is over).
///
/// Owner 2026-10-20 (like WhatsApp): a tap on the call notification, or on a
/// chat's call button during the call, opens the call screen again.
/// Owner 2026-10-23: the green "Return to call" bar over every screen is
/// gone; a call that runs is the Calls tab's «Ongoing now» row and the call
/// button above the «+» of Chats (LiveCallsFab).
class CallHost extends ConsumerWidget {
  const CallHost({required this.router, required this.child, super.key});

  final GoRouter router;
  final Widget child;

  bool _onCallScreen(WidgetRef ref) =>
      ref.read(callScreenVisibleProvider) ||
      router.routerDelegate.currentConfiguration.uri.path == ChatRoutes.call;

  /// The group's own chat shows its call bar itself.
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
        } else if (s.busy && s.phase != CallPhase.incoming && !onScreen) {
          // Owner 2026-10-26 (exactly like WhatsApp): a call that runs while
          // the person is elsewhere in the app — the green bar on top.
          top = _ReturnBar(
            session: s,
            onOpen: () => unawaited(router.push<void>(ChatRoutes.call)),
          );
        } else if (!s.busy &&
            invite != null &&
            !(invite.groupId != null && _inChatOf(invite.groupId!))) {
          top = CallInviteBar(key: ValueKey(invite.callId), invite: invite);
        } else {
          top = null;
        }
        // The app below keeps one place in the tree whether the bar shows or
        // not: moving `child` between a bare return and a Column remounted
        // the whole navigator under it (a debug `_dependents.isEmpty`
        // assertion on the first call from a chat, device test 2026-10-20).
        // The bar takes the status-bar strip, so what is below it must not
        // pad for the status bar a second time.
        final media = ref.read(callControllerProvider.notifier).media;
        final floating = s.video &&
            s.phase == CallPhase.active &&
            !onScreen &&
            media != null;
        return Stack(
          children: [
            Column(
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
            ),
            // Owner 2026-10-26 (WhatsApp): a video call minimised inside
            // the app floats as a small picture; a tap opens the call.
            if (floating)
              Positioned.fill(
                child: ValueListenableBuilder(
                  valueListenable: media.remoteVideo,
                  builder: (context, stream, _) => stream == null
                      ? const SizedBox.shrink()
                      : CallPipWindow(
                          key: const Key('call-floating-pip'),
                          stream: stream,
                          topInset: MediaQuery.paddingOf(context).top + 56,
                          bottomInset:
                              MediaQuery.paddingOf(context).bottom + 96,
                          onTap: () =>
                              unawaited(router.push<void>(ChatRoutes.call)),
                          onSwap: () =>
                              unawaited(router.push<void>(ChatRoutes.call)),
                        ),
                ),
              )
            else
              const SizedBox.shrink(),
          ],
        );
      },
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
                colors.dangerFill,
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

/// Owner 2026-10-26 (exactly like WhatsApp): the green bar on top of the
/// app while a call runs elsewhere — «Return to call · 2:14»; a tap opens
/// the call.
class _ReturnBar extends ConsumerWidget {
  const _ReturnBar({required this.session, required this.onOpen});

  final CallSession session;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      child: GestureDetector(
        key: const Key('call-return-bar'),
        behavior: HitTestBehavior.opaque,
        onTap: onOpen,
        child: ColoredBox(
          color: AppCallColors.accept,
          child: SafeArea(
            bottom: false,
            child: SizedBox(
              height: 32,
              child: Center(
                child: StreamBuilder<int>(
                  stream: Stream<int>.periodic(
                    const Duration(seconds: 1),
                    (i) => i,
                  ),
                  builder: (context, _) => Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const AppIcon(
                        AppIcons.callRounded,
                        size: 16,
                        color: Colors.white,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Flexible(
                        child: Text(
                          [
                            t.t('call.returnToCall'),
                            callStatusText(t, session),
                          ].where((x) => x.isNotEmpty).join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: CallTextSizes.status,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
