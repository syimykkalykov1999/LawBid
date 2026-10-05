import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/features/trust/presentation/my_trust_screen.dart';

/// Owner 2026-10-05 — attorney trust levels: the attorney's own «Мой
/// уровень доверия» screen (Settings → next to Subscription; trust
/// notifications land here). Pushed on the ROOT navigator.
abstract final class TrustRoutes {
  static const me = '/trust/me';
}

List<RouteBase> trustRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: TrustRoutes.me,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const MyTrustScreen()),
      ),
    ];
