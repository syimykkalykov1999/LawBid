import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/pop_then_push.dart';
import 'package:lawbid/features/calls/application/call_foreground.dart';
import 'package:lawbid/features/calls/application/call_screen_addon.dart';
import 'package:lawbid/features/cases/domain/bid_from_call.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_controller.dart';
import 'package:lawbid/features/hotline/application/hotline_attorney_providers.dart';
import 'package:lawbid/features/hotline/domain/hotline_attorney_models.dart';
import 'package:lawbid/features/hotline/presentation/hotline_attorney_call.dart';
import 'package:lawbid/features/hotline/presentation/hotline_attorney_fab.dart';
import 'package:lawbid/features/legal_qa/application/qa_feed_slots.dart';
import 'package:material_ui/material_ui.dart';

/// The attorney's hotline over every screen (like `CallHost` for calls):
/// an offer from the line opens OUR call screen in its incoming phase
/// (mockup a4 — the attorney is on the line screen, so a full ring, not the
/// compact banner); the client's «Предложить дело» opens our bid form with
/// the «Дело из звонка» card while the call goes on in the green bar
/// (mockup a8). Does nothing for clients or while the hotline is off.
class HotlineAttorneyHost extends ConsumerWidget {
  const HotlineAttorneyHost({
    required this.router,
    required this.child,
    super.key,
  });

  final GoRouter router;
  final Widget child;

  bool _onCallScreen(WidgetRef ref) =>
      ref.read(callScreenVisibleProvider) ||
      router.routerDelegate.currentConfiguration.uri.path == ChatRoutes.call;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(hotlineIsAttorneyProvider)) return child;
    // Slots of other features are filled after this frame (no provider
    // change while the tree builds).
    void later(void Function() f) => Future<void>.microtask(f);
    ref
      ..listen<HotlineCallInfo?>(
        hotlineAttorneyControllerProvider.select((s) => s.call),
        (_, info) => later(
          () => ref.read(callScreenAddonProvider.notifier).set(
                hotlineAttorneyAddon(
                  info,
                  moreLabel:
                      ref.read(translatorProvider).t('hotline.menu.more'),
                ),
              ),
        ),
      )
      // «Моё → Вопросы»: the line's button in the «+» place (mockup a1).
      ..listen<bool>(
        hotlineAttorneyVisibleProvider,
        (_, on) => later(
          () => ref
              .read(qaFeedFabSlotProvider.notifier)
              .set(on ? (_) => const HotlineAttorneyFab() : null),
        ),
      )
      ..listen<int>(
        hotlineAttorneyControllerProvider.select((s) => s.openCallScreen),
        (prev, next) {
          if (next == (prev ?? 0) || _onCallScreen(ref)) return;
          unawaited(router.push<void>(ChatRoutes.call));
        },
      )
      ..listen<HotlineCaseOffered?>(
        hotlineAttorneyControllerProvider.select((s) => s.caseOffered),
        (prev, next) {
          if (next == null) return;
          ref
              .read(hotlineAttorneyControllerProvider.notifier)
              .caseOfferedShown();
          // The call minimises (it goes on in the green bar) and the bid
          // form opens over it.
          // The push waits for that pop (bug 27.11: a push sent first went
          // away with the call page, leaving the page under the call).
          unawaited(
            popNavigatorThenPush<void>(
              navigator: appRootNavigatorKey.currentState,
              router: router,
              pop: _onCallScreen(ref),
              location: AppRoutes.placeBid(next.caseId),
              extra: BidFromCall(
                topic: next.topic,
                state: next.state,
                budgetCents: next.budgetCents,
              ),
            ),
          );
        },
      );
    return child;
  }
}
