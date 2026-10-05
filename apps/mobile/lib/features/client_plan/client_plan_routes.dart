import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/client_plan/presentation/client_plan_screen.dart';

/// Owner 2026-10-05 (plan builder): Settings → «Подписка клиента».
abstract final class ClientPlanRoutes {
  static const clientPlan = '/profile/settings/client-plan';
}

List<RouteBase> clientPlanRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: ClientPlanRoutes.clientPlan,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const ClientPlanScreen()),
      ),
    ];
