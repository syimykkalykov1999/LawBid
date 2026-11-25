import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/features/hotline/application/hotline_controller.dart';
import 'package:lawbid/features/hotline/domain/hotline_models.dart';
import 'package:lawbid/features/hotline/hotline_routes.dart';
import 'package:lawbid/features/hotline/presentation/hotline_entry_fab.dart';
import 'package:lawbid/features/hotline/presentation/hotline_review_sheet.dart';
import 'package:lawbid/features/legal_qa/application/qa_feed_slots.dart';
import 'package:material_ui/material_ui.dart';

/// The client's hotline over every screen (like `CallHost` for calls):
/// after a start or a restart it brings back the request this account had
/// waiting; «Адвокат на линии. Позвонить сейчас?» opens wherever the client
/// is; the short review comes up after a call that was connected. Does
/// nothing while the hotline is off or for an attorney.
class HotlineHost extends ConsumerStatefulWidget {
  const HotlineHost({required this.router, required this.child, super.key});

  final GoRouter router;
  final Widget child;

  @override
  ConsumerState<HotlineHost> createState() => _HotlineHostState();
}

class _HotlineHostState extends ConsumerState<HotlineHost> {
  GoRouter get router => widget.router;

  bool _onStatus() =>
      router.routerDelegate.currentConfiguration.uri.path ==
      HotlineRoutes.status;

  @override
  void initState() {
    super.initState();
    // «Вопросы» shows our call button above its «+» (mockup v4 c1); the
    // button itself hides while the line is off or for an attorney.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref
          .read(qaFeedFabSlotProvider.notifier)
          .set((_) => const HotlineEntryFab());
    });
    ref.listenManual<bool>(
      hotlineClientVisibleProvider,
      (_, on) {
        if (!on) return;
        final c = ref.read(hotlineControllerProvider.notifier);
        unawaited(c.loadConfig());
        unawaited(c.restore());
      },
      fireImmediately: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    ref
      ..listen<HotlineNotice?>(
        hotlineControllerProvider.select((s) => s.notice),
        (_, n) {
          if (n == null || _onStatus()) return;
          unawaited(router.push<void>(HotlineRoutes.status));
        },
      )
      ..listen<HotlineReviewPrompt?>(
        hotlineControllerProvider.select((s) => s.review),
        (prev, next) {
          if (next == null || prev != null) return;
          // After the call screen closed (its pop runs first).
          WidgetsBinding.instance.addPostFrameCallback((_) {
            final ctx = appRootNavigatorKey.currentContext;
            if (ctx == null ||
                ref.read(hotlineControllerProvider).review == null) {
              return;
            }
            unawaited(showHotlineReviewSheet(ctx, router: router));
          });
        },
      );
    return widget.child;
  }
}
