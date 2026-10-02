import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/cases/data/cases_mappers.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Resource-creating POSTs carry an Idempotency-Key (IdempotencyInterceptor).
const Map<String, dynamic> _createsResource = {
  RequestFlags.createsResource: true,
};

/// A bid form (docs/04 §5.1).
class BidInput {
  const BidInput({
    required this.feeType,
    required this.message,
    required this.startAvailability,
    this.amountCents,
    this.startDate,
    this.estimatedDurationDays,
  });

  final FeeType feeType;
  final int? amountCents;
  final String message;
  final StartAvailability startAvailability;
  final DateTime? startDate;
  final int? estimatedDurationDays;
}

/// Audit 2026-10-01: Search-tab case filters the server applies.
@immutable
class CaseFeedExtras {
  const CaseFeedExtras({
    this.period,
    this.budgetMin,
    this.budgetMax,
    this.budgetUnknown = false,
    this.noBids = false,
  });

  /// `24h` · `7d` · `30d` · null = all.
  final String? period;
  final int? budgetMin;
  final int? budgetMax;
  final bool budgetUnknown;
  final bool noBids;

  @override
  bool operator ==(Object other) =>
      other is CaseFeedExtras &&
      other.period == period &&
      other.budgetMin == budgetMin &&
      other.budgetMax == budgetMax &&
      other.budgetUnknown == budgetUnknown &&
      other.noBids == noBids;

  @override
  int get hashCode =>
      Object.hash(period, budgetMin, budgetMax, budgetUnknown, noBids);
}

/// docs/04 cases & bids for the app (§3–§12). Throws [ApiException].
/// Network access only through here (.cursorrules).
abstract interface class CasesRepository {
  // --- client ---
  Future<String> createCase(
    CaseDraft draft, {
    required bool contactSharingConsent,
    List<String> photoFileIds = const [],
  });

  /// §3.5 edit: only changed fields are sent — practice area and states
  /// only when they changed (the server refuses those once bids exist).
  Future<void> updateCase(OwnerCase original, CaseDraft draft);
  Future<CursorPage<CaseSummary>> myCases(
    MyCasesFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  });
  Future<OwnerCase> ownerCase(String caseId);
  Future<CursorPage<CaseBid>> caseBids(
    String caseId,
    BidsSort sort, {
    String? cursor,
  });
  Future<void> closeCase(String caseId);
  Future<void> deleteCase(String caseId);
  Future<void> restoreCase(String caseId);
  Future<void> keepAlive(String caseId);
  Future<void> completeCase(String caseId);

  // --- both parties of a bid ---
  Future<CaseBid> bid(String bidId);
  Future<CaseBid> accept(String bidId);
  Future<CaseBid> counter(
    String bidId, {
    required int amountCents,
    String? message,
  });
  Future<CaseBid> decline(String bidId);
  Future<CaseBid> withdraw(String bidId);

  // --- attorney ---
  Future<CursorPage<FeedCase>> feed({
    String? cursor,
    String? practiceAreaId,
    String? practiceCategory,
    String? state,
    CaseFeedExtras extras = const CaseFeedExtras(),
  });
  Future<FeedCase> attorneyCase(String caseId);
  Future<void> recordView(String caseId);
  Future<void> setSaved(String caseId, {required bool saved});
  Future<CaseBid> placeBid(String caseId, BidInput input);
  Future<CursorPage<MyBid>> myBids(
    MyBidsFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  });
  Future<CursorPage<WorkItem>> myWork(
    WorkFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  });
  Future<CursorPage<SavedCase>> savedCases({
    String? cursor,
    MineSearch search = const MineSearch(),
  });
  Future<ClientContacts> contacts(String caseId);
  Future<void> reportContactIssue(
    String caseId,
    ContactIssueType type,
    String? note,
  );
  Future<void> confirmCompletion(String caseId);
  Future<void> dispute(String caseId, String reason);
  Future<CaseConversation> openConversation(String caseId);

  // --- history (docs/04 §12) ---
  Future<CursorPage<HistoryCase>> history(String reauthToken, {String? cursor});
  Future<HistoryCaseDetail> historyCase(String reauthToken, String caseId);
  Future<HistoryExport> startExport(String reauthToken);
  Future<HistoryExport> exportStatus(String reauthToken, String exportId);
}

class ApiCasesRepository implements CasesRepository {
  ApiCasesRepository(Dio dio)
      : _cases = api.CasesClient(dio),
        _bids = api.BidsClient(dio),
        _mine = api.MineClient(dio),
        _history = api.CaseHistoryClient(dio);

  final api.CasesClient _cases;
  final api.BidsClient _bids;
  final api.MineClient _mine;
  final api.CaseHistoryClient _history;

  static const pageSize = 20;

  // --- client ---------------------------------------------------------

  @override
  Future<String> createCase(
    CaseDraft draft, {
    required bool contactSharingConsent,
    List<String> photoFileIds = const [],
  }) async {
    final env = await guardApiCall(
      () => _cases.createCase(
        body: api.CreateCaseDto(
          practiceAreaId: draft.practiceAreaId!,
          title: draft.title.trim(),
          description: draft.description.trim(),
          primaryStateCode: draft.primaryStateCode!,
          additionalStateCodes: draft.additionalStateCodes,
          city: draft.city.trim().isEmpty ? null : draft.city.trim(),
          budgetMode: draft.budgetIsAmount
              ? api.BudgetMode.amount
              : api.BudgetMode.clarifyLater,
          budgetAmountDollars:
              draft.budgetIsAmount ? draft.budgetDollars : null,
          clientContactSharingConsent: contactSharingConsent ? true : null,
          photoFileIds: photoFileIds.isEmpty ? null : photoFileIds,
        ),
        extras: _createsResource,
      ),
    );
    return env.data.id;
  }

  @override
  Future<void> updateCase(OwnerCase original, CaseDraft draft) async {
    final states = draft.additionalStateCodes;
    final statesChanged = draft.primaryStateCode != original.primaryStateCode ||
        states.length != original.additionalStateCodes.length ||
        states.any((s) => !original.additionalStateCodes.contains(s));
    final amountCents = draft.budgetIsAmount && draft.budgetDollars != null
        ? draft.budgetDollars! * 100
        : null;
    final budgetChanged = draft.budgetIsAmount ==
            original.budget.isClarifyLater ||
        (draft.budgetIsAmount && amountCents != original.budget.amountCents);
    await guardApiCall(
      () => _cases.updateCase(
        id: original.id,
        body: api.UpdateCaseDto(
          title: draft.title.trim(),
          description: draft.description.trim(),
          practiceAreaId: draft.practiceAreaId != original.practice.id
              ? draft.practiceAreaId
              : null,
          primaryStateCode: statesChanged ? draft.primaryStateCode : null,
          additionalStateCodes: statesChanged ? states : null,
          // An empty string clears the city (null would mean "unchanged").
          city: draft.city.trim(),
          budgetMode: budgetChanged
              ? (draft.budgetIsAmount
                  ? api.BudgetMode.amount
                  : api.BudgetMode.clarifyLater)
              : null,
          budgetAmountDollars: budgetChanged && draft.budgetIsAmount
              ? draft.budgetDollars
              : null,
        ),
      ),
    );
  }

  @override
  Future<CursorPage<CaseSummary>> myCases(
    MyCasesFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) async {
    final env = await guardApiCall(
      () => _cases.listMyCases(
        cursor: cursor,
        filter: switch (filter) {
          MyCasesFilter.active => api.Filter.active,
          MyCasesFilter.open => api.Filter.open,
          MyCasesFilter.inProgress => api.Filter.inProgress,
          MyCasesFilter.archived => api.Filter.archived,
          MyCasesFilter.closed => api.Filter.closed,
        },
        q: _q(search),
        practice: search.practice,
        state: search.state,
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.summary).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<OwnerCase> ownerCase(String caseId) async => CasesMappers.ownerCase(
        (await guardApiCall(() => _mine.getMyCase(id: caseId))).data,
      );

  @override
  Future<CursorPage<CaseBid>> caseBids(
    String caseId,
    BidsSort sort, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _cases.listCaseBids(
        id: caseId,
        cursor: cursor,
        sort: switch (sort) {
          BidsSort.newest => api.Sort.newest,
          BidsSort.lowestPrice => api.Sort.lowestPrice,
          BidsSort.highestRating => api.Sort.highestRating,
        },
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.listedBid).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<void> closeCase(String caseId) =>
      guardApiCall(() => _cases.closeCase(id: caseId));

  @override
  Future<void> deleteCase(String caseId) =>
      guardApiCall(() => _cases.deleteCase(id: caseId));

  @override
  Future<void> restoreCase(String caseId) =>
      guardApiCall(() => _cases.restoreCase(id: caseId));

  @override
  Future<void> keepAlive(String caseId) =>
      guardApiCall(() => _cases.keepCaseAlive(id: caseId));

  @override
  Future<void> completeCase(String caseId) =>
      guardApiCall(() => _cases.completeCase(id: caseId));

  // --- bids -----------------------------------------------------------

  @override
  Future<CaseBid> bid(String bidId) async => CasesMappers.bid(
        (await guardApiCall(() => _bids.getBid(id: bidId))).data,
      );

  @override
  Future<CaseBid> accept(String bidId) async => CasesMappers.bid(
        (await guardApiCall(
          () => _bids.acceptBid(id: bidId, extras: _createsResource),
        ))
            .data,
      );

  @override
  Future<CaseBid> counter(
    String bidId, {
    required int amountCents,
    String? message,
  }) async =>
      CasesMappers.bid(
        (await guardApiCall(
          () => _bids.counter(
            id: bidId,
            body: api.CounterOfferDto(
              amountCents: amountCents,
              message:
                  (message?.trim().isEmpty ?? true) ? null : message!.trim(),
            ),
            extras: _createsResource,
          ),
        ))
            .data,
      );

  @override
  Future<CaseBid> decline(String bidId) async => CasesMappers.bid(
        (await guardApiCall(() => _bids.decline(id: bidId))).data,
      );

  @override
  Future<CaseBid> withdraw(String bidId) async => CasesMappers.bid(
        (await guardApiCall(() => _bids.withdraw(id: bidId))).data,
      );

  // --- attorney -------------------------------------------------------

  @override
  Future<CursorPage<FeedCase>> feed({
    String? cursor,
    String? practiceAreaId,
    String? practiceCategory,
    String? state,
    CaseFeedExtras extras = const CaseFeedExtras(),
  }) async {
    final env = await guardApiCall(
      () => _cases.listCaseFeed(
        cursor: cursor,
        practiceAreaId: practiceAreaId,
        // Owner 2026-09-30: any qualification picked in the topic filter
        // (category or subcategory) — every case of it, own practice or
        // not.
        practice: practiceCategory,
        state: state,
        // Audit 2026-10-01: the Search tab's filters, on the server.
        period:
            extras.period == null ? null : api.Period.fromJson(extras.period!),
        budgetMin: extras.budgetMin,
        budgetMax: extras.budgetMax,
        budgetUnknown: extras.budgetUnknown ? true : null,
        noBids: extras.noBids ? true : null,
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.feedCase).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<FeedCase> attorneyCase(String caseId) async =>
      CasesMappers.attorneyCase(
        (await guardApiCall(() => _cases.getCaseDetail(id: caseId))).data,
      );

  @override
  Future<void> recordView(String caseId) =>
      guardApiCall(() => _cases.recordCaseView(id: caseId));

  @override
  Future<void> setSaved(String caseId, {required bool saved}) {
    final body =
        api.SavedItemDto(itemType: api.SavedItemType.valueCase, itemId: caseId);
    return guardApiCall(
      () => saved ? _cases.saveItem(body: body) : _cases.unsaveItem(body: body),
    );
  }

  @override
  Future<CaseBid> placeBid(String caseId, BidInput input) async =>
      CasesMappers.bid(
        (await guardApiCall(
          () => _bids.createBid(
            caseId: caseId,
            body: api.CreateBidDto(
              feeType: input.feeType,
              amountCents: input.feeType == FeeType.freeConsultation
                  ? null
                  : input.amountCents,
              message: input.message.trim(),
              startAvailability: input.startAvailability,
              startDate: input.startAvailability == StartAvailability.customDate
                  ? input.startDate
                  : null,
              estimatedDurationDays: input.estimatedDurationDays,
            ),
            extras: _createsResource,
          ),
        ))
            .data,
      );

  @override
  Future<CursorPage<MyBid>> myBids(
    MyBidsFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) async {
    final env = await guardApiCall(
      () => _mine.listMyBids(
        cursor: cursor,
        q: _q(search),
        practice: search.practice,
        state: search.state,
        filter: filter == MyBidsFilter.active
            ? api.Filter2.active
            : api.Filter2.finished,
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.myBid).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<WorkItem>> myWork(
    WorkFilter filter, {
    String? cursor,
    MineSearch search = const MineSearch(),
  }) async {
    final env = await guardApiCall(
      () => _mine.listMyWork(
        cursor: cursor,
        q: _q(search),
        practice: search.practice,
        state: search.state,
        filter: filter == WorkFilter.active
            ? api.Filter3.active
            : api.Filter3.closed,
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.workItem).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<CursorPage<SavedCase>> savedCases({
    String? cursor,
    MineSearch search = const MineSearch(),
  }) async {
    final env = await guardApiCall(
      () => _mine.listSavedItems(
        type: api.Type.valueCase,
        cursor: cursor,
        q: _q(search),
        practice: search.practice,
        state: search.state,
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.savedCase).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  static String? _q(MineSearch s) => s.q.trim().isEmpty ? null : s.q.trim();

  @override
  Future<ClientContacts> contacts(String caseId) async => CasesMappers.contacts(
        (await guardApiCall(() => _cases.getCaseContacts(id: caseId))).data,
      );

  @override
  Future<void> reportContactIssue(
    String caseId,
    ContactIssueType type,
    String? note,
  ) =>
      guardApiCall(
        () => _cases.reportContactIssue(
          id: caseId,
          body: api.CreateContactIssueDto(
            issueType: type,
            note: (note?.trim().isEmpty ?? true) ? null : note!.trim(),
          ),
          extras: _createsResource,
        ),
      );

  @override
  Future<void> confirmCompletion(String caseId) =>
      guardApiCall(() => _cases.confirmCaseCompletion(id: caseId));

  @override
  Future<void> dispute(String caseId, String reason) => guardApiCall(
        () => _cases.disputeCase(
          id: caseId,
          body: api.DisputeCaseDto(reason: reason.trim()),
          extras: _createsResource,
        ),
      );

  @override
  Future<CaseConversation> openConversation(String caseId) async {
    final d =
        (await guardApiCall(() => _mine.openCaseConversation(id: caseId))).data;
    return CaseConversation(
      id: d.conversationId,
      contactsUnlocked: d.contactsUnlocked,
    );
  }

  // --- history --------------------------------------------------------

  @override
  Future<CursorPage<HistoryCase>> history(
    String reauthToken, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _history.listCaseHistory(
        xReauthToken: reauthToken,
        cursor: cursor,
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.historyItem).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<HistoryCaseDetail> historyCase(
    String reauthToken,
    String caseId,
  ) async =>
      CasesMappers.historyDetail(
        (await guardApiCall(
          () => _history.getCaseHistory(
            caseId: caseId,
            xReauthToken: reauthToken,
          ),
        ))
            .data,
      );

  @override
  Future<HistoryExport> startExport(String reauthToken) async =>
      CasesMappers.export(
        (await guardApiCall(
          () => _history.exportCaseHistory(xReauthToken: reauthToken),
        ))
            .data,
      );

  @override
  Future<HistoryExport> exportStatus(
    String reauthToken,
    String exportId,
  ) async =>
      CasesMappers.export(
        (await guardApiCall(
          () => _history.getCaseHistoryExport(
            exportId: exportId,
            xReauthToken: reauthToken,
          ),
        ))
            .data,
      );
}
