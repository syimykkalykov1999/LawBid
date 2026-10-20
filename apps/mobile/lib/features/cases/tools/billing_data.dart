import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/tools/billing_logic.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart'
    show PickedCaseFile;
import 'package:lawbid/features/social/application/social_providers.dart'
    show socialRepositoryProvider;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: the data of the case tab "Time" — rate, timer, time,
/// expenses, totals and invoices. The client's answer holds invoices only.
Duration? _noRetry(int retryCount, Object error) => null;

final caseBillingClientProvider = Provider<api.CaseBillingClient>(
  (ref) => api.CaseBillingClient(ref.watch(dioProvider)),
);

final caseBillingProvider =
    FutureProvider.autoDispose.family<api.CaseBillingDto, String>(
  (ref, id) async => (await guardApiCall(
    () => ref.watch(caseBillingClientProvider).getCaseBilling(id: id),
  ))
      .data,
  retry: _noRetry,
);

/// Mutations. Every one reloads the tab afterwards — also when it failed,
/// so a stale screen (a timer stopped on another device) corrects itself.
class CaseBillingActions {
  CaseBillingActions(this._ref);

  final Ref _ref;

  api.CaseBillingClient get _c => _ref.read(caseBillingClientProvider);

  Future<void> _run(String caseId, Future<Object?> Function() call) async {
    try {
      await guardApiCall(call);
    } finally {
      _ref.invalidate(caseBillingProvider(caseId));
    }
  }

  Future<void> reload(String caseId) async {
    _ref.invalidate(caseBillingProvider(caseId));
  }

  Future<void> setRate(String caseId, int cents) => _run(
        caseId,
        () => _c.setCaseRate(
          id: caseId,
          body: api.SetRateDto(hourlyRateCents: cents),
        ),
      );

  Future<void> startTimer(String caseId) =>
      _run(caseId, () => _c.startCaseTimer(id: caseId));

  Future<void> stopTimer(String caseId) => _run(
        caseId,
        () => _c.stopCaseTimer(id: caseId, body: const api.StopTimerDto()),
      );

  Future<void> addTime(
    String caseId, {
    required DateTime day,
    required int minutes,
    String? note,
  }) =>
      _run(
        caseId,
        () => _c.addCaseTime(
          id: caseId,
          body: api.AddTimeDto(
            workedOn: dayForServer(day),
            minutes: minutes,
            note: note == null || note.isEmpty ? null : note,
          ),
        ),
      );

  Future<void> updateTime(
    String caseId,
    String entryId, {
    required DateTime day,
    required int minutes,
    required String note,
  }) =>
      _run(
        caseId,
        () => _c.updateCaseTime(
          id: caseId,
          entryId: entryId,
          body: api.UpdateTimeDto(
            workedOn: dayForServer(day),
            minutes: minutes,
            note: note,
          ),
        ),
      );

  Future<void> deleteTime(String caseId, String entryId) =>
      _run(caseId, () => _c.deleteCaseTime(id: caseId, entryId: entryId));

  Future<void> addExpense(
    String caseId, {
    required DateTime day,
    required String description,
    required int cents,
    PickedCaseFile? receipt,
  }) async {
    String? fileId;
    if (receipt != null) {
      fileId = await _ref.read(socialRepositoryProvider).uploadPostPhoto(
            receipt.bytes,
            casePhoto: true,
            fileName: receipt.name,
            maxBytes: 50 * 1024 * 1024,
          );
    }
    await _run(
      caseId,
      () => _c.addCaseExpense(
        id: caseId,
        body: api.AddExpenseDto(
          spentOn: dayForServer(day),
          description: description,
          amountCents: cents,
          receiptFileId: fileId,
        ),
      ),
    );
  }

  Future<void> deleteExpense(String caseId, String entryId) =>
      _run(caseId, () => _c.deleteCaseExpense(id: caseId, entryId: entryId));

  Future<void> issueInvoice(String caseId, {String? note}) => _run(
        caseId,
        () => _c.issueCaseInvoice(
          id: caseId,
          body: api.IssueInvoiceDto(
            note: note == null || note.isEmpty ? null : note,
          ),
        ),
      );
}

final caseBillingActionsProvider =
    Provider<CaseBillingActions>(CaseBillingActions.new);
