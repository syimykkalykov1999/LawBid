import 'package:lawbid_api/lawbid_api.dart' as api;

import 'package:lawbid/features/cases/domain/case_models.dart';

DateTime _date(String iso) => DateTime.parse(iso).toLocal();
DateTime? _dateOrNull(String? iso) => iso == null ? null : _date(iso);

/// API DTO → domain (docs/04). Pure functions, unit-tested.
abstract final class CasesMappers {
  static PracticeRef practiceRef(api.PracticeAreaRefDto p) => PracticeRef(
        id: p.id,
        code: p.code,
        i18nKey: p.i18nKey,
        nameEn: p.nameEn,
      );

  static PracticeRef feedPractice(api.CasePracticeAreaDto p) => PracticeRef(
        id: p.id,
        code: p.code,
        i18nKey: p.i18nKey,
        nameEn: p.nameEn,
        categoryI18nKey: p.categoryI18nKey,
        categoryNameEn: p.categoryNameEn,
        categoryCode: p.categoryCode,
      );

  static CaseSummary summary(api.CaseSummaryDto c) => CaseSummary(
        id: c.id,
        coverUrl: c.coverUrl,
        title: c.title,
        practice: practiceRef(c.practiceArea),
        primaryStateCode: c.primaryStateCode,
        additionalStateCount: c.additionalStateCount,
        city: c.city,
        status: c.status,
        budget: CaseBudget(mode: c.budgetMode, amountCents: c.budgetCents),
        bidsCount: c.bidsCount,
        createdAt: _date(c.createdAt),
        lastActivityAt: _date(c.lastActivityAt),
      );

  static OwnerCase ownerCase(api.OwnerCaseDetailDto c) => OwnerCase(
        id: c.id,
        title: c.title,
        description: c.description,
        practice: practiceRef(c.practiceArea),
        primaryStateCode: c.primaryStateCode,
        additionalStateCodes: [
          for (final s in c.states)
            if (!s.isPrimary) s.stateCode,
        ],
        city: c.city,
        budget: CaseBudget(mode: c.budgetMode, amountCents: c.budgetCents),
        status: c.status,
        viewCount: c.viewCount,
        bidsCount: c.bidsCount,
        createdAt: _date(c.createdAt),
        lastActivityAt: _date(c.lastActivityAt),
        archivedAt: _dateOrNull(c.archivedAt),
        clientCompletedAt: _dateOrNull(c.clientCompletedAt),
        autoCloseAt: _dateOrNull(c.autoCloseAt),
        closedAt: _dateOrNull(c.closedAt),
        acceptedBid: c.acceptedBid == null ? null : listedBid(c.acceptedBid!),
        conversationId: c.conversationId,
        photos: c.photos.map(casePhoto).toList(growable: false),
      );

  static CasePhoto casePhoto(api.CasePhotoDto p) => CasePhoto(
        fileId: p.fileId,
        url: p.url,
        previewUrl: p.previewUrl,
        mime: p.mime,
        sizeBytes: p.sizeBytes.toInt(),
      );

  static BidAttorney attorney(api.BidAttorneySummaryDto a) => BidAttorney(
        id: a.id,
        username: a.username,
        firstName: a.firstName,
        lastName: a.lastName,
        avatarUrl: a.avatarUrl256,
        verifiedBadge: a.verifiedBadge,
        ratingAvg: a.rating.avg.toDouble(),
        ratingCount: a.rating.count.toInt(),
      );

  static BidOffer offer(api.BidOfferDto o) => BidOffer(
        id: o.id,
        roundNo: o.roundNo,
        fromRole: o.fromRole,
        feeType: o.feeType,
        amountCents: o.amountCents,
        message: o.message,
        status: o.status,
        createdAt: o.createdAt.toLocal(),
      );

  static CaseBid listedBid(api.CaseBidItemDto b) => CaseBid(
        id: b.id,
        caseId: b.caseId,
        attorneyId: b.attorneyId,
        status: b.status,
        feeType: b.feeType,
        amountCents: b.amountCents,
        message: b.message,
        startAvailability: b.startAvailability,
        startDate: b.startDate,
        estimatedDurationDays: b.estimatedDurationDays,
        roundCount: b.roundCount,
        turn: b.turn,
        createdAt: b.createdAt.toLocal(),
        decidedAt: b.decidedAt?.toLocal(),
        attorney: attorney(b.attorney),
        outsidePractice: b.outsidePractice,
      );

  static CaseBid bid(api.BidDto b) => CaseBid(
        id: b.id,
        caseId: b.caseId,
        attorneyId: b.attorneyId,
        status: b.status,
        feeType: b.feeType,
        amountCents: b.amountCents,
        message: b.message,
        startAvailability: b.startAvailability,
        startDate: b.startDate,
        estimatedDurationDays: b.estimatedDurationDays,
        roundCount: b.roundCount,
        turn: b.turn,
        createdAt: b.createdAt.toLocal(),
        decidedAt: b.decidedAt?.toLocal(),
        offers: b.offers.map(offer).toList(growable: false),
        outsidePractice: b.outsidePractice,
      );

  static FeedCase feedCase(api.CaseFeedItemDto c) => FeedCase(
        id: c.id,
        title: c.title,
        excerpt: c.excerpt,
        practice: feedPractice(c.practiceArea),
        primaryStateCode: c.primaryStateCode,
        additionalStateCodes: c.additionalStateCodes,
        city: c.city,
        status: c.status,
        budget:
            CaseBudget(mode: c.budget.mode, amountCents: c.budget.amountCents),
        viewCount: c.viewCount,
        bidsCount: c.bidsCount,
        createdAt: c.createdAt.toLocal(),
        isNew: c.isNew,
        hasOwnBid: c.hasOwnBid,
        isSaved: c.isSaved,
        commentCount: c.commentCount.toInt(),
        shareCount: c.shareCount.toInt(),
      );

  static FeedCase attorneyCase(api.CaseDetailForAttorneyDto c) => FeedCase(
        id: c.id,
        title: c.title,
        excerpt: c.excerpt,
        practice: feedPractice(c.practiceArea),
        primaryStateCode: c.primaryStateCode,
        additionalStateCodes: c.additionalStateCodes,
        city: c.city,
        status: c.status,
        budget:
            CaseBudget(mode: c.budget.mode, amountCents: c.budget.amountCents),
        viewCount: c.viewCount,
        bidsCount: c.bidsCount,
        createdAt: c.createdAt.toLocal(),
        isNew: c.isNew,
        hasOwnBid: c.hasOwnBid,
        description: c.description,
        isSaved: c.isSaved,
        ownBidId: c.ownBidId,
        photos: c.photos.map(casePhoto).toList(growable: false),
        photosCount: c.photosCount.toInt(),
        commentCount: c.commentCount.toInt(),
        shareCount: c.shareCount.toInt(),
        inMyPractice: c.inMyPractice,
      );

  static MyBid myBid(api.MyBidItemDto b) => MyBid(
        bid: CaseBid(
          id: b.id,
          caseId: b.caseId,
          attorneyId: b.attorneyId,
          status: b.status,
          feeType: b.feeType,
          amountCents: b.amountCents,
          message: b.message,
          startAvailability: b.startAvailability,
          startDate: b.startDate,
          estimatedDurationDays: b.estimatedDurationDays,
          roundCount: b.roundCount,
          turn: b.turn,
          createdAt: b.createdAt.toLocal(),
          decidedAt: b.decidedAt?.toLocal(),
        ),
        caseId: b.caseValue.id,
        caseTitle: b.caseValue.title,
        caseStatus: b.caseValue.status,
        casePracticeI18nKey: b.caseValue.practiceAreaI18nKey,
        casePracticeNameEn: b.caseValue.practiceAreaNameEn,
        casePracticeCode: b.caseValue.practiceAreaCode,
        primaryStateCode: b.caseValue.primaryStateCode,
        lastOffer: offer(b.lastOffer),
        coverUrl: b.coverUrl,
      );

  static WorkItem workItem(api.WorkItemDto w) => WorkItem(
        caseId: w.caseId,
        coverUrl: w.coverUrl,
        bidId: w.bidId,
        title: w.title,
        status: w.status,
        clientName: w.clientName,
        feeType: w.feeType,
        amountCents: w.amountCents,
        autoCloseAt: _dateOrNull(w.autoCloseAt),
        acceptedAt: _dateOrNull(w.acceptedAt),
        closedAt: _dateOrNull(w.closedAt),
        primaryStateCode: w.primaryStateCode,
        practiceCode: w.practiceAreaCode,
        practiceI18nKey: w.practiceAreaI18nKey,
        practiceNameEn: w.practiceAreaNameEn,
      );

  static SavedCase savedCase(api.SavedCaseItemDto s) => SavedCase(
        caseId: s.caseId,
        savedAt: _date(s.savedAt),
        available: s.available,
        title: s.title,
        card: s.caseValue == null ? null : feedCase(s.caseValue!),
      );

  static ClientContacts contacts(api.ClientContactsDto c) => ClientContacts(
        caseId: c.caseId,
        bidId: c.bidId,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email,
        contactMethod: c.contactMethod,
        contactNote: c.contactNote,
        disclosedAt: c.disclosedAt.toLocal(),
      );

  static HistoryCase historyItem(api.CaseHistoryItemDto c) => HistoryCase(
        id: c.id,
        title: c.title,
        practiceI18nKey: c.practiceArea.i18nKey,
        practiceNameEn: c.practiceArea.nameEn,
        primaryStateCode: c.primaryStateCode,
        status: c.status,
        deleted: c.deleted,
        createdAt: _date(c.createdAt),
        closedAt: _dateOrNull(c.closedAt),
        archivedAt: _dateOrNull(c.archivedAt),
        acceptedAmountCents: c.acceptedBid?.amountCents,
        acceptedFeeType: c.acceptedBid?.feeType,
      );

  static HistoryCaseDetail historyDetail(api.CaseHistoryDetailDto c) =>
      HistoryCaseDetail(
        item: HistoryCase(
          id: c.id,
          title: c.title,
          practiceI18nKey: c.practiceArea.i18nKey,
          practiceNameEn: c.practiceArea.nameEn,
          primaryStateCode: c.primaryStateCode,
          status: c.status,
          deleted: c.deleted,
          createdAt: _date(c.createdAt),
          closedAt: _dateOrNull(c.closedAt),
          archivedAt: _dateOrNull(c.archivedAt),
          acceptedAmountCents: c.acceptedBid?.amountCents,
          acceptedFeeType: c.acceptedBid?.feeType,
        ),
        clientName: c.clientName,
        events: [
          for (final e in c.events)
            HistoryEvent(
              id: e.id,
              eventType: e.eventType,
              createdAt: _date(e.createdAt),
              actor: switch (e.actorRole) {
                api.CaseHistoryEventDtoActorRole.client => HistoryActor.client,
                api.CaseHistoryEventDtoActorRole.attorney =>
                  HistoryActor.attorney,
                api.CaseHistoryEventDtoActorRole.admin => HistoryActor.admin,
                _ => HistoryActor.system,
              },
              amountCents: e.amountCents?.toInt(),
              feeType: e.feeType,
              roundNo: e.roundNo?.toInt(),
              reason: e.reason,
            ),
        ],
      );

  static HistoryExport export(api.CaseHistoryExportDto e) => HistoryExport(
        exportId: e.exportId,
        status: switch (e.status) {
          api.CaseHistoryExportDtoStatus.ready => HistoryExportStatus.ready,
          api.CaseHistoryExportDtoStatus.failed => HistoryExportStatus.failed,
          _ => HistoryExportStatus.queued,
        },
        url: e.url,
        expiresAt: _dateOrNull(e.expiresAt),
      );
}
