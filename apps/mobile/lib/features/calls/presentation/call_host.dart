import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/callkit_bridge.dart';
import 'package:lawbid/features/chat/chat_routes.dart';

/// OQ-041: opens the call screen over whatever is on screen when a call
/// starts here or rings in (the screen closes itself when it is over).
class CallHost extends ConsumerWidget {
  const CallHost({required this.router, required this.child, super.key});

  final GoRouter router;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // System call UI answers/declines → the controller.
    ref.watch(callkitEventsProvider);
    ref.listen(callControllerProvider.select((s) => s.phase), (prev, next) {
      final opened = (prev == null || prev == CallPhase.idle) &&
          (next == CallPhase.outgoing || next == CallPhase.incoming);
      if (!opened) return;
      final here = router.routerDelegate.currentConfiguration.uri.path;
      if (here != ChatRoutes.call) router.push(ChatRoutes.call);
    });
    return child;
  }
}
