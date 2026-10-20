import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
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
      final opened = !wasLive &&
          (next == CallPhase.outgoing || next == CallPhase.incoming);
      if (!opened) return;
      if (!_onCallScreen(ref)) unawaited(router.push<void>(ChatRoutes.call));
    });
    ref.listen(callOpenRequestProvider, (_, __) {
      if (ref.read(callControllerProvider).busy && !_onCallScreen(ref)) {
        unawaited(router.push<void>(ChatRoutes.call));
      }
    });
    final s = ref.watch(callControllerProvider);
    ref.watch(callScreenVisibleProvider);
    final talking = s.phase == CallPhase.outgoing ||
        s.phase == CallPhase.connecting ||
        s.phase == CallPhase.active;
    return ListenableBuilder(
      listenable: router.routerDelegate,
      builder: (context, _) {
        final bar = talking && !_onCallScreen(ref);
        if (!bar) return child;
        // The bar takes the status-bar strip; what is below it must not
        // pad for the status bar a second time.
        return Column(
          children: [
            _ReturnToCallBar(
              session: s,
              onTap: () => unawaited(router.push<void>(ChatRoutes.call)),
            ),
            Expanded(
              child: MediaQuery.removePadding(
                context: context,
                removeTop: true,
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
              height: 36,
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
