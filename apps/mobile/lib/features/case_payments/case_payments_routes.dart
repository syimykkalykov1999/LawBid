import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_page_transitions.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/features/case_payments/presentation/payout_account_screen.dart'
    deferred as d_payout_account_screen;

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
        pageBuilder: (context, state) => AppPageTransitions.push(
          state,
          DeferredScreen(
            id: 'payout_account_screen',
            load: d_payout_account_screen.loadLibrary,
            builder: (_) => d_payout_account_screen.PayoutAccountScreen(),
          ),
        ),
      ),
      // Owner 2026-10-22 (audit #4 §1): the case payments are a tab of the
      // one «Платежи» page; old links (pushes, Stripe returns) land there.
      GoRoute(
        path: CasePaymentsRoutes.history,
        redirect: (context, state) => AppRoutes.paymentsTab('cases'),
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
