import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/presentation/case_payments_history_screen.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/subscription/presentation/payments_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// The tabs of the one «Платежи» page.
enum PaymentsTab {
  receipts,
  cases,
  purchases;

  static PaymentsTab parse(String? raw) => PaymentsTab.values.firstWhere(
        (v) => v.name == raw,
        orElse: () => PaymentsTab.receipts,
      );
}

/// Owner 2026-10-22 (product audit #4 §1, Stripe / Slack «Billing»): one
/// «Платежи» page, the same for clients and attorneys — the subscription
/// and Boost receipts, the case payments (while `payments_in_app` is on)
/// and the purchases (stars, offer packs, the client badge, promotions).
/// Before, clients had two rows and attorneys found receipts only under
/// Subscription.
class PaymentsHubScreen extends ConsumerStatefulWidget {
  const PaymentsHubScreen({this.initial = PaymentsTab.receipts, super.key});

  final PaymentsTab initial;

  @override
  ConsumerState<PaymentsHubScreen> createState() => _PaymentsHubScreenState();
}

class _PaymentsHubScreenState extends ConsumerState<PaymentsHubScreen> {
  late PaymentsTab _tab = widget.initial;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final tabs = [
      PaymentsTab.receipts,
      if (ref.watch(casePaymentsFlagProvider)) PaymentsTab.cases,
      PaymentsTab.purchases,
    ];
    final tab = tabs.contains(_tab) ? _tab : PaymentsTab.receipts;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('payments.hub.title')),
        actions: [
          if (tab == PaymentsTab.cases) const CasePaymentsCsvButton(),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            const SizedBox(height: AppSpacing.sm),
            FilterChips<PaymentsTab>(
              value: tab,
              options: [
                for (final v in tabs) (v, t.t('payments.tab.${v.name}')),
              ],
              onChanged: (v) => setState(() => _tab = v),
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: SwipePages<PaymentsTab>(
                value: tab,
                values: tabs,
                onChanged: (v) => setState(() => _tab = v),
                pageBuilder: (_, v) => switch (v) {
                  PaymentsTab.receipts => const SubscriptionPaymentsList(),
                  PaymentsTab.cases => const CasePaymentsHistoryList(),
                  PaymentsTab.purchases => const _Purchases(),
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// What was bought with money besides the subscription: each kind keeps its
/// own balance and history on its screen.
class _Purchases extends ConsumerWidget {
  const _Purchases();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final flags = ref.watch(featureFlagsControllerProvider);
    final role = ref.watch(currentUserRoleProvider);
    final assistant = ref.watch(isAssistantProvider);
    final rows = <Widget>[
      if (!assistant && flags.isEnabled('stars'))
        AppListRow(
          key: const ValueKey('payments-stars'),
          icon: AppIcons.starRounded,
          label: t.t('stars.title'),
          subtitle: t.t('stars.hint'),
          onTap: () => context.push(AppRoutes.stars),
        ),
      if (role == UserRole.attorney &&
          !assistant &&
          flags.isEnabled('bid_packs'))
        AppListRow(
          key: const ValueKey('payments-bid-packs'),
          icon: AppIcons.localOfferOutlined,
          label: t.t('packs.title'),
          subtitle: t.t('packs.hint'),
          onTap: () => context.push(AppRoutes.bidPacks),
        ),
      if (role == UserRole.client)
        AppListRow(
          key: const ValueKey('payments-client-badge'),
          icon: AppIcons.militaryTechRounded,
          label: t.t('cbadge.title'),
          onTap: () => context.push(AppRoutes.clientBadge),
        ),
      if (!assistant &&
          (ref.watch(myPromotionsProvider).value?.items.isNotEmpty ?? false))
        AppListRow(
          key: const ValueKey('payments-promotions'),
          icon: AppIcons.campaignOutlined,
          label: t.t('promote.mine.title'),
          subtitle: t.t('promote.mine.hint'),
          onTap: () => context.push(AppRoutes.myPromotions),
        ),
    ];
    if (rows.isEmpty) {
      return AppEmptyState(
        icon: AppIcons.receiptLongOutlined,
        message: t.t('payments.purchases.empty'),
      );
    }
    return ListView(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
      ),
      children: [AppListSection(children: rows)],
    );
  }
}
