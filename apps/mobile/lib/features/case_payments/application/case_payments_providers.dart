import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/case_payments/data/case_payments_repository.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

final casePaymentsRepositoryProvider = Provider<CasePaymentsRepository>(
  (ref) => CasePaymentsRepository(ref.watch(dioProvider)),
);

/// The `payments_in_app` flag — hides every entry point when off.
final casePaymentsFlagProvider = Provider<bool>(
  (ref) =>
      ref.watch(featureFlagsControllerProvider).isEnabled('payments_in_app'),
);

final paymentSettingsProvider = FutureProvider.autoDispose<PaymentSettings>(
  (ref) => ref.watch(casePaymentsRepositoryProvider).settings(),
);

/// Payments of one case (owner's and attorney's case screens).
final casePaymentsStateProvider =
    FutureProvider.autoDispose.family<CasePaymentsState, String>(
  (ref, caseId) => ref.watch(casePaymentsRepositoryProvider).caseState(caseId),
);

/// The attorney's Stripe payout account.
final payoutAccountProvider = FutureProvider.autoDispose<PayoutAccount>(
  (ref) => ref.watch(casePaymentsRepositoryProvider).payoutAccount(),
);

final casePaymentsSummaryProvider = FutureProvider.autoDispose<PaymentsSummary>(
  (ref) => ref.watch(casePaymentsRepositoryProvider).summary(),
);

final casePaymentsHistoryProvider = AsyncNotifierProvider.autoDispose<
    CasePaymentsHistoryNotifier, PaginatedList<CasePayment>>(
  CasePaymentsHistoryNotifier.new,
);

class CasePaymentsHistoryNotifier extends PagedNotifier<CasePayment> {
  @override
  Future<CursorPage<CasePayment>> fetch(String? cursor) =>
      ref.read(casePaymentsRepositoryProvider).history(cursor: cursor);

  @override
  Object idOf(CasePayment item) => item.id;
}
