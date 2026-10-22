import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/subscription/presentation/paywall_screen.dart';
import 'package:lawbid/features/subscription/presentation/subscription_screen.dart';

/// docs/06 §1.7 routes: Settings → Подписка, its payment history, and the
/// gate paywall (`AppRoutes.subscriptionRequired`, docs/04 §2).
abstract final class SubscriptionRoutes {
  static const subscription = '/profile/settings/subscription';
  static const payments = '/profile/settings/subscription/payments';
}

List<RouteBase> subscriptionRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: SubscriptionRoutes.subscription,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const SubscriptionScreen()),
      ),
      // Owner 2026-10-22 (audit #4 §1): the receipts live on the one
      // «Платежи» page (an old link lands on its first tab).
      GoRoute(
        path: SubscriptionRoutes.payments,
        redirect: (context, state) => AppRoutes.paymentsTab('receipts'),
      ),
      GoRoute(
        path: AppRoutes.subscriptionRequired,
        parentNavigatorKey: root,
        pageBuilder: (context, state) => AppPageTransitions.modal(
          state,
          PaywallScreen(
            reason: PaywallReason.parse(state.uri.queryParameters['reason']),
          ),
        ),
      ),
    ];
