import 'package:lawbid_api/lawbid_api.dart' as api;

/// Sample data for the case-tools widget tests.
api.CaseBillingDto billingDto({required bool attorney, bool noRate = false}) =>
    api.CaseBillingDto(
      role: attorney
          ? api.CaseBillingDtoRole.attorney
          : api.CaseBillingDtoRole.client,
      canEdit: attorney,
      currency: 'USD',
      hourlyRateCents: attorney && !noRate ? 15000 : null,
      timer: attorney
          ? api.RunningTimerDto(
              entryId: 'r',
              caseId: 'c',
              caseTitle: 'Case',
              startedAt: DateTime.now().subtract(const Duration(minutes: 3)),
            )
          : null,
      entries: attorney
          ? [
              api.TimeEntryDto(
                id: 'r',
                workedOn: DateTime(2026, 10, 20),
                minutes: 0,
                runningSince: DateTime.now(),
                note: '',
                rateCents: 15000,
                cents: 0,
                invoiceId: null,
              ),
              api.TimeEntryDto(
                id: 'e1',
                workedOn: DateTime(2026, 10, 19),
                minutes: 95,
                runningSince: null,
                note: 'Call with the court clerk about the hearing date',
                rateCents: 15000,
                cents: 23750,
                invoiceId: null,
              ),
            ]
          : const [],
      expenses: attorney
          ? [
              api.ExpenseDto(
                id: 'x1',
                spentOn: DateTime(2026, 10, 19),
                description: 'Court filing fee and courier delivery',
                amountCents: 4500,
                receiptUrl: null,
                receiptPreviewUrl: null,
                invoiceId: null,
              ),
            ]
          : const [],
      unbilled: const api.BillingTotalsDto(
        minutes: 95,
        timeCents: 23750,
        expensesCents: 4500,
        totalCents: 28250,
      ),
      invoices: [
        api.InvoiceDto(
          id: 'i1',
          number: 'LB-3F9A12CD-001',
          createdAt: DateTime(2026, 10, 18),
          currency: 'USD',
          minutes: 60,
          timeCents: 15000,
          expensesCents: 0,
          totalCents: 15000,
          note: null,
          lines: const [],
          url: 'https://example.com/i1.pdf',
          fileId: 'f1',
          status: api.InvoiceDtoStatus.sent,
          dueAt: null,
          sentAt: null,
          viewedAt: null,
          paidAt: null,
          paidCents: 0,
          lateFeeCents: 0,
          balanceCents: 15000,
          remindersEnabled: true,
          payUrl: null,
        ),
      ],
    );

api.SignRequestDto signReq(
  String id,
  String title,
  api.SignRequestDtoStatus status, {
  bool canSign = false,
  bool canCancel = false,
  List<api.SignatureDto> signatures = const [],
  String? reason,
}) =>
    api.SignRequestDto(
      id: id,
      title: title,
      status: status,
      createdByRole: api.SignRequestDtoCreatedByRole.attorney,
      createdAt: DateTime.utc(2026, 10, 18, 10),
      completedAt: null,
      sourceUrl: 'https://files.test/$id.pdf',
      finalUrl: null,
      sourceSha256: 'a' * 64,
      finalSha256: null,
      signatures: signatures,
      canSign: canSign,
      canDecline: canSign,
      canCancel: canCancel,
      declinedByRole:
          reason == null ? null : api.SignRequestDtoDeclinedByRole.client,
      declineReason: reason,
      expiresAt: null,
      expired: false,
      remindersSent: 0,
      lastRemindedAt: null,
      views: const [],
      canResend: false,
    );
