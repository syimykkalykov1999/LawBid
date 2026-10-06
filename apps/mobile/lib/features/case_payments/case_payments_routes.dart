import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/case_payments/presentation/case_payments_history_screen.dart';
import 'package:lawbid/features/case_payments/presentation/payout_account_screen.dart';

/// Owner 2026-10-05: Settings → «Приём оплат» (attorney) and «Платежи по
/// делам» (both roles), plus the return pages of Stripe's hosted flows
/// (`lawbid.dev/payment/success|cancel`, `/payout/return|refresh`).
abstract final class CasePaymentsRoutes {
  static const payoutAccount = '/profile/settings/payouts';
  static const history = '/profile/settings/case-payments';
  static const paymentSuccess = '/payment/success';
  static const paymentCancel = '/payment/cancel';
  static const payoutReturn = '/payout/return';
  static const payoutRefresh = '/payout/refresh';
}

List<RouteBase> casePaymentsRoutes(GlobalKey<NavigatorState> root) => [
      GoRoute(
        path: CasePaymentsRoutes.payoutAccount,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const PayoutAccountScreen()),
      ),
      GoRoute(
        path: CasePaymentsRoutes.history,
        parentNavigatorKey: root,
        pageBuilder: (context, state) =>
            AppPageTransitions.push(state, const CasePaymentsHistoryScreen()),
      ),
      // Back from Stripe Checkout: the case screen re-reads the payment.
      for (final path in [
        CasePaymentsRoutes.paymentSuccess,
        CasePaymentsRoutes.paymentCancel,
      ])
        GoRoute(
          path: path,
          redirect: (context, state) {
            final caseId = state.uri.queryParameters['case_id'];
            return caseId == null || caseId.isEmpty
                ? CasePaymentsRoutes.history
                : AppRoutes.myCase(caseId);
          },
        ),
      // Back from Stripe's onboarding (done or the link expired).
      for (final path in [
        CasePaymentsRoutes.payoutReturn,
        CasePaymentsRoutes.payoutRefresh,
      ])
        GoRoute(
          path: path,
          redirect: (context, state) => CasePaymentsRoutes.payoutAccount,
        ),
    ];
