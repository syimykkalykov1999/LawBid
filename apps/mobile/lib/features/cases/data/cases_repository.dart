import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/core/sync/synced_list_notifier.dart' show SyncedPage;
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
    this.percentBps,
    this.startDate,
    this.estimatedDurationDays,
    this.sendAsAttorneyId,
    this.paymentTerms,
  });

  /// Owner 2026-10-14: the firm lawyer who sends the bid (null: me).
  final String? sendAsAttorneyId;

  /// Deal record 2026-10-27: rich payment terms (only while the admin
  /// switch `bids.rich_terms_enabled` is on).
  final api.PaymentTermsDto? paymentTerms;
  final FeeType feeType;
  final int? amountCents;

  /// Owner 2026-10-17: contingency → basis points (3300 = 33 %).
  final int? percentBps;
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
    this.budgetPercent = false,
    this.percentMax,
    this.noBids = false,
    this.minUrgency,
    this.hasDeadline = false,
    this.forYou = false,
  });

  /// `24h` · `7d` · `30d` · null = all.
  final String? period;
  final int? budgetMin;
  final int? budgetMax;
  final bool budgetUnknown;

  /// Owner 2026-10-18: percent budgets too (up to [percentMax] percent).
  final bool budgetPercent;
  final int? percentMax;
  final bool noBids;

  /// Owner 2026-10-05: `soon` · `urgent` · `very_urgent` (at least), or
  /// null; and only cases with a date still ahead.
  final String? minUrgency;
  final bool hasDeadline;

  /// Owner 2026-10-13: ranked for this attorney instead of newest first.
  final bool forYou;

  @override
  bool operator ==(Object other) =>
      other is CaseFeedExtras &&
      other.minUrgency == minUrgency &&
      other.hasDeadline == hasDeadline &&
      other.forYou == forYou &&
      other.period == period &&
      other.budgetMin == budgetMin &&
      other.budgetMax == budgetMax &&
      other.budgetUnknown == budgetUnknown &&
      other.budgetPercent == budgetPercent &&
      other.percentMax == percentMax &&
      other.noBids == noBids;

  @override
  int get hashCode => Object.hash(
        period,
        budgetMin,
        budgetMax,
        budgetUnknown,
        budgetPercent,
        percentMax,
        noBids,
        minUrgency,
        hasDeadline,
        forYou,
      );
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

  /// Owner 2026-10-05: the full set of the case's photos and documents
  /// (display order) — the client completes the dossier after publishing.
  Future<void> setCaseFiles(String caseId, List<String> fileIds);

  /// Owner 2026-10-05: the urgency or the date alone — also after an
  /// attorney is hired (client or hired attorney); the other side is told.
  Future<void> setCaseUrgency(
    String caseId, {
    required String urgency,
    DateTime? deadline,
    String? deadlineKind,
  });

  /// Audit 2026-10-19: «Подробности» — the client, also once hired; an
  /// empty text clears them.
  Future<void> setPrivateDetails(String caseId, String text);
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

  /// OQ-054: the answer to «Вам ещё нужен адвокат?».
  Future<void> answerStillNeeded(String caseId, StillNeededAnswer answer);

  /// OQ-054: bring a paused case back into the attorneys' feed.
  Future<void> resumeCase(String caseId);
  Future<void> completeCase(String caseId);

  // --- both parties of a bid ---
  Future<CaseBid> bid(String bidId);
  Future<CaseBid> accept(String bidId);

  /// [percentBps] for a contingency bid (owner 2026-10-17), else
  /// [amountCents].
  Future<CaseBid> counter(
    String bidId, {
    int? amountCents,
    int? percentBps,
    String? message,
    api.PaymentTermsDto? paymentTerms,
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
    bool mineOnly = true,
    // Owner 2026-10-06: several states at once.
    List<String> states = const [],
  });
  Future<FeedCase> attorneyCase(String caseId);

  /// Owner 2026-10-22 (client economy plan, package A): views of several
  /// cases in one `POST /cases/views` (1–50 ids).
  Future<void> recordViews(List<String> caseIds);
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

/// Owner 2026-10-22 (client economy plan, package E): the `?updatedSince`
/// side of the «Mine» lists — only the rows changed since, plus the ids
/// that left the tab. Kept apart from [CasesRepository] so the test fakes
/// need not know it (a list without it reloads its first page).
abstract interface class CasesSyncRepository {
  Future<SyncedPage<CaseSummary>> myCasesChangedSince(
    MyCasesFilter filter,
    DateTime since,
  );
  Future<SyncedPage<MyBid>> myBidsChangedSince(
    MyBidsFilter filter,
    DateTime since,
  );
  Future<SyncedPage<WorkItem>> myWorkChangedSince(
    WorkFilter filter,
    DateTime since,
  );

  /// Owner 2026-10-22 (delta audit D-P4): the bids of one case changed
  /// since [since].
  Future<SyncedPage<CaseBid>> caseBidsChangedSince(
    String caseId,
    DateTime since,
  );
}

class ApiCasesRepository implements CasesRepository, CasesSyncRepository {
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
          extraPracticeAreaIds: draft.extraPractices.isEmpty
              ? null
              : [for (final p in draft.extraPractices) p.id],
          title: draft.title.trim(),
          description: draft.description.trim(),
          privateDetails: draft.privateDetails.trim().isEmpty
              ? null
              : draft.privateDetails.trim(),
          primaryStateCode: draft.primaryStateCode!,
          additionalStateCodes: draft.additionalStateCodes,
          city: draft.city.trim().isEmpty ? null : draft.city.trim(),
          budgetMode: _budgetMode(draft),
          budgetAmountDollars:
              draft.budgetIsAmount ? draft.budgetDollars : null,
          budgetPercentBps:
              draft.budgetIsPercent ? draft.budgetPercentBps : null,
          clientContactSharingConsent: contactSharingConsent ? true : null,
          photoFileIds: photoFileIds.isEmpty ? null : photoFileIds,
          coverKey: draft.coverKey,
          urgency: api.CaseUrgency.fromJson(
            draft.urgency ?? kDefaultCaseUrgency,
          ),
          // Owner 2026-10-05: the day itself (a local calendar date).
          deadlineAt:
              draft.urgency == 'by_date' ? parseIsoDay(draft.deadlineAt) : null,
          deadlineKind: draft.urgency == 'by_date' && draft.deadlineKind != null
              ? api.CaseDeadlineKind.fromJson(draft.deadlineKind!)
              : null,
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
    final budgetChanged = _budgetMode(draft) != original.budget.mode ||
        (draft.budgetIsAmount && amountCents != original.budget.amountCents) ||
        (draft.budgetIsPercent &&
            draft.budgetPercentBps != original.budget.percentBps);
    await guardApiCall(
      () => _cases.updateCase(
        id: original.id,
        body: api.UpdateCaseDto(
          title: draft.title.trim(),
          description: draft.description.trim(),
          // Sent only when changed; an empty string clears it.
          privateDetails:
              draft.privateDetails.trim() != (original.privateDetails ?? '')
                  ? draft.privateDetails.trim()
                  : null,
          practiceAreaId: draft.practiceAreaId != original.practice.id
              ? draft.practiceAreaId
              : null,
          // Owner 2026-10-15: sent only when the topics changed (empty =
          // just the first).
          extraPracticeAreaIds: _sameIds(
            [for (final p in draft.extraPractices) p.id],
            [for (final p in original.extraPractices) p.id],
          )
              ? null
              : [for (final p in draft.extraPractices) p.id],
          primaryStateCode: statesChanged ? draft.primaryStateCode : null,
          additionalStateCodes: statesChanged ? states : null,
          // An empty string clears the city (null would mean "unchanged").
          city: draft.city.trim(),
          budgetMode: budgetChanged ? _budgetMode(draft) : null,
          budgetAmountDollars: budgetChanged && draft.budgetIsAmount
              ? draft.budgetDollars
              : null,
          budgetPercentBps: budgetChanged && draft.budgetIsPercent
              ? draft.budgetPercentBps
              : null,
          coverKey: draft.coverKey != original.coverKey ? draft.coverKey : null,
          urgency:
              draft.urgency != null && draft.urgency != original.urgency?.json
                  ? api.CaseUrgency.fromJson(draft.urgency!)
                  : null,
          // Owner 2026-10-05: a level clears the date on the server.
          deadlineAt: draft.urgency == 'by_date' &&
                  draft.deadlineAt != null &&
                  parseIsoDay(draft.deadlineAt) != original.urgencyInfo.deadline
              ? parseIsoDay(draft.deadlineAt)
              : null,
          deadlineKind: draft.urgency == 'by_date' &&
                  draft.deadlineKind != null &&
                  draft.deadlineKind != original.urgencyInfo.kind?.json
              ? api.CaseDeadlineKind.fromJson(draft.deadlineKind!)
              : null,
        ),
      ),
    );
  }

  @override
  Future<void> setPrivateDetails(String caseId, String text) async {
    await guardApiCall(
      () => _cases.updateCasePrivateDetails(
        id: caseId,
        body: api.UpdatePrivateDetailsDto(privateDetails: text.trim()),
      ),
    );
  }

  @override
  Future<void> setCaseUrgency(
    String caseId, {
    required String urgency,
    DateTime? deadline,
    String? deadlineKind,
  }) async {
    final dated = urgency == 'by_date';
    await guardApiCall(
      () => _cases.updateCaseUrgency(
        id: caseId,
        body: api.UpdateCaseUrgencyDto(
          urgency: api.CaseUrgency.fromJson(urgency),
          deadlineAt: dated && deadline != null
              ? DateTime(deadline.year, deadline.month, deadline.day)
              : null,
          deadlineKind: dated && deadlineKind != null
              ? api.CaseDeadlineKind.fromJson(deadlineKind)
              : null,
        ),
      ),
    );
  }

  @override
  Future<void> setCaseFiles(String caseId, List<String> fileIds) async {
    await guardApiCall(
      () => _cases.updateCase(
        id: caseId,
        body: api.UpdateCaseDto(photoFileIds: fileIds),
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
        filter: _myCasesFilter(filter),
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

  static api.Filter _myCasesFilter(MyCasesFilter filter) => switch (filter) {
        MyCasesFilter.active => api.Filter.active,
        MyCasesFilter.open => api.Filter.open,
        MyCasesFilter.inProgress => api.Filter.inProgress,
        MyCasesFilter.archived => api.Filter.archived,
        MyCasesFilter.closed => api.Filter.closed,
        MyCasesFilter.completed => api.Filter.completed,
      };

  @override
  Future<SyncedPage<CaseSummary>> myCasesChangedSince(
    MyCasesFilter filter,
    DateTime since,
  ) async {
    final env = await guardApiCall(
      () => _cases.listMyCases(
        filter: _myCasesFilter(filter),
        updatedSince: since.toUtc(),
      ),
    );
    return SyncedPage(
      items: env.data.map(CasesMappers.summary).toList(growable: false),
      deletedIds: env.meta?.deletedIds ?? const [],
      syncedAt: env.meta?.syncedAt,
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
  Future<void> answerStillNeeded(String caseId, StillNeededAnswer answer) =>
      guardApiCall(
        () => _cases.answerStillNeeded(
          id: caseId,
          body: api.StillNeededAnswerDto(answer: answer),
        ),
      );

  @override
  Future<void> resumeCase(String caseId) =>
      guardApiCall(() => _cases.resumeCase(id: caseId));

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
    int? amountCents,
    int? percentBps,
    String? message,
    api.PaymentTermsDto? paymentTerms,
  }) async =>
      CasesMappers.bid(
        (await guardApiCall(
          () => _bids.counter(
            id: bidId,
            body: api.CounterOfferDto(
              amountCents: amountCents,
              percentBps: percentBps,
              paymentTerms: paymentTerms,
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
    bool mineOnly = true,
    // Owner 2026-10-06: several states at once.
    List<String> states = const [],
  }) async {
    final env = await guardApiCall(
      () => _cases.listCaseFeed(
        scope: mineOnly ? api.Scope.licensed : api.Scope.all,
        cursor: cursor,
        practiceAreaId: practiceAreaId,
        // Owner 2026-09-30: any qualification picked in the topic filter
        // (category or subcategory) — every case of it, own practice or
        // not.
        practice: practiceCategory,
        state: state,
        states: states.isEmpty ? null : states.join(','),
        // Audit 2026-10-01: the Search tab's filters, on the server.
        period:
            extras.period == null ? null : api.Period.fromJson(extras.period!),
        budgetMin: extras.budgetMin,
        budgetMax: extras.budgetMax,
        budgetUnknown: extras.budgetUnknown ? true : null,
        budgetPercent: extras.budgetPercent ? true : null,
        percentMax: extras.budgetPercent ? extras.percentMax : null,
        noBids: extras.noBids ? true : null,
        minUrgency: extras.minUrgency == null
            ? null
            : api.MinUrgency.fromJson(extras.minUrgency!),
        hasDeadline: extras.hasDeadline ? true : null,
        sort: extras.forYou ? api.CasesFeedSort.forYou : null,
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
  Future<void> recordViews(List<String> caseIds) => guardApiCall(
        () => _cases.recordCaseViews(body: api.CaseViewsDto(caseIds: caseIds)),
      );

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
              amountCents: input.feeType == FeeType.freeConsultation ||
                      input.feeType == FeeType.contingency
                  ? null
                  : input.amountCents,
              percentBps: input.feeType == FeeType.contingency
                  ? input.percentBps
                  : null,
              message: input.message.trim(),
              startAvailability: input.startAvailability,
              startDate: input.startAvailability == StartAvailability.customDate
                  ? input.startDate
                  : null,
              estimatedDurationDays: input.estimatedDurationDays,
              sendAsAttorneyId: input.sendAsAttorneyId,
              paymentTerms: input.paymentTerms,
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
        filter: _myBidsFilter(filter),
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.myBid).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  static api.Filter2 _myBidsFilter(MyBidsFilter filter) => switch (filter) {
        MyBidsFilter.active => api.Filter2.active,
        MyBidsFilter.finished => api.Filter2.finished,
        MyBidsFilter.completed => api.Filter2.completed,
      };

  @override
  Future<SyncedPage<MyBid>> myBidsChangedSince(
    MyBidsFilter filter,
    DateTime since,
  ) async {
    final env = await guardApiCall(
      () => _mine.listMyBids(
        filter: _myBidsFilter(filter),
        updatedSince: since.toUtc(),
      ),
    );
    return SyncedPage(
      items: env.data.map(CasesMappers.myBid).toList(growable: false),
      deletedIds: env.meta?.deletedIds ?? const [],
      syncedAt: env.meta?.syncedAt,
    );
  }

  @override
  Future<SyncedPage<CaseBid>> caseBidsChangedSince(
    String caseId,
    DateTime since,
  ) async {
    final env = await guardApiCall(
      () => _cases.listCaseBids(id: caseId, updatedSince: since.toUtc()),
    );
    return SyncedPage(
      items: env.data.map(CasesMappers.listedBid).toList(growable: false),
      deletedIds: env.meta?.deletedIds ?? const [],
      syncedAt: env.meta?.syncedAt,
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
        filter: _workFilter(filter),
      ),
    );
    return CursorPage(
      items: env.data.map(CasesMappers.workItem).toList(growable: false),
      nextCursor: env.meta?.nextCursor,
    );
  }

  static api.Filter3 _workFilter(WorkFilter filter) =>
      filter == WorkFilter.active ? api.Filter3.active : api.Filter3.closed;

  @override
  Future<SyncedPage<WorkItem>> myWorkChangedSince(
    WorkFilter filter,
    DateTime since,
  ) async {
    final env = await guardApiCall(
      () => _mine.listMyWork(
        filter: _workFilter(filter),
        updatedSince: since.toUtc(),
      ),
    );
    return SyncedPage(
      items: env.data.map(CasesMappers.workItem).toList(growable: false),
      deletedIds: env.meta?.deletedIds ?? const [],
      syncedAt: env.meta?.syncedAt,
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

bool _sameIds(List<String> a, List<String> b) =>
    a.length == b.length && a.toSet().containsAll(b);

/// Owner 2026-10-17: «Сумма», «Проценты» or «Уточню позже».
api.BudgetMode _budgetMode(CaseDraft d) => d.budgetIsPercent
    ? api.BudgetMode.percent
    : d.budgetIsAmount
        ? api.BudgetMode.amount
        : api.BudgetMode.clarifyLater;
