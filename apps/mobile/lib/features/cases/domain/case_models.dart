import 'package:flutter/foundation.dart';
import 'package:lawbid_api/lawbid_api.dart'
    show
        BidStatus,
        BudgetMode,
        CaseStatus,
        ContactIssueType,
        ContactMethod,
        FeeType,
        OfferStatus,
        PartyRole,
        StartAvailability;

export 'package:lawbid_api/lawbid_api.dart'
    show
        BidStatus,
        BudgetMode,
        CaseStatus,
        ContactIssueType,
        ContactMethod,
        FeeType,
        OfferStatus,
        PartyRole,
        StartAvailability;

/// docs/04 §6.1: at most 5 counter-offers per bid.
const int kMaxNegotiationRounds = 5;

/// docs/04 §4.2: a case younger than 24 hours shows NEW.
const Duration kCaseNewBadgeAge = Duration(hours: 24);

/// Practice area as the cases API returns it (leaf + its category).
@immutable
class PracticeRef {
  const PracticeRef({
    required this.id,
    required this.code,
    required this.i18nKey,
    required this.nameEn,
    this.categoryI18nKey,
    this.categoryNameEn,
    this.categoryCode,
  });

  final String id;
  final String code;
  final String i18nKey;
  final String nameEn;
  final String? categoryI18nKey;
  final String? categoryNameEn;

  /// The top-level category code (e.g. `family_law`) — picks the card art.
  /// Falls back to the leaf code's first segment.
  final String? categoryCode;

  String get artCode => categoryCode ?? code.split('.').first;
}

/// docs/04 §3.2 budget: whole-case amount in cents or "Clarify later".
@immutable
class CaseBudget {
  const CaseBudget({required this.mode, this.amountCents});

  final BudgetMode mode;
  final int? amountCents;

  bool get isClarifyLater => mode != BudgetMode.amount || amountCents == null;
}

/// "Мои кейсы" card (docs/04 §11.1).
@immutable
class CaseSummary {
  const CaseSummary({
    required this.id,
    required this.title,
    required this.practice,
    required this.primaryStateCode,
    required this.additionalStateCount,
    required this.city,
    required this.status,
    required this.budget,
    required this.bidsCount,
    required this.createdAt,
    required this.lastActivityAt,
  });

  final String id;
  final String title;
  final PracticeRef practice;
  final String primaryStateCode;
  final int additionalStateCount;
  final String? city;
  final CaseStatus status;
  final CaseBudget budget;
  final int bidsCount;
  final DateTime createdAt;
  final DateTime lastActivityAt;
}

/// The owner's full case (docs/04 §11.1) incl. "Адвокат в работе".
@immutable

/// OQ-031: a case photo — short-lived signed links.
@immutable
class CasePhoto {
  const CasePhoto({
    required this.fileId,
    required this.url,
    required this.previewUrl,
    this.mime = 'image/jpeg',
    this.sizeBytes = 0,
  });

  final String fileId;
  final String url;
  final String previewUrl;

  /// OQ-034: photos and documents (PDF, Word) share the list.
  final String mime;
  final int sizeBytes;

  bool get isImage => mime.startsWith('image/');
}

class OwnerCase {
  const OwnerCase({
    required this.id,
    required this.title,
    required this.description,
    required this.practice,
    required this.primaryStateCode,
    required this.additionalStateCodes,
    required this.city,
    required this.budget,
    required this.status,
    required this.viewCount,
    required this.bidsCount,
    required this.createdAt,
    required this.lastActivityAt,
    this.archivedAt,
    this.clientCompletedAt,
    this.autoCloseAt,
    this.closedAt,
    this.acceptedBid,
    this.conversationId,
    this.photos = const [],
  });

  /// OQ-031: the case photos (the owner always sees them).
  final List<CasePhoto> photos;

  final String id;
  final String title;
  final String description;
  final PracticeRef practice;
  final String primaryStateCode;
  final List<String> additionalStateCodes;
  final String? city;
  final CaseBudget budget;
  final CaseStatus status;
  final int viewCount;
  final int bidsCount;
  final DateTime createdAt;
  final DateTime lastActivityAt;
  final DateTime? archivedAt;
  final DateTime? clientCompletedAt;
  final DateTime? autoCloseAt;
  final DateTime? closedAt;
  final CaseBid? acceptedBid;
  final String? conversationId;

  /// §3.5: practice area and states are editable only without bids.
  bool get canChangePracticeAndStates => bidsCount == 0;
}

/// Public summary of the bidding attorney (docs/04 §5.2).
@immutable
class BidAttorney {
  const BidAttorney({
    required this.id,
    required this.username,
    required this.firstName,
    required this.lastName,
    required this.avatarUrl,
    required this.verifiedBadge,
    required this.ratingAvg,
    required this.ratingCount,
  });

  final String id;
  final String username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final bool verifiedBadge;
  final double ratingAvg;
  final int ratingCount;

  String get fullName => [firstName, lastName]
      .whereType<String>()
      .where((s) => s.isNotEmpty)
      .join(' ');
}

/// One step of the negotiation (docs/04 §6, `bid_offers`).
@immutable
class BidOffer {
  const BidOffer({
    required this.id,
    required this.roundNo,
    required this.fromRole,
    required this.feeType,
    required this.amountCents,
    required this.message,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final int roundNo;
  final PartyRole fromRole;
  final FeeType feeType;
  final int amountCents;
  final String? message;
  final OfferStatus status;
  final DateTime createdAt;
}

/// A bid with its terms; [attorney] is present in the client's list,
/// [offers] in the bid detail.
@immutable
class CaseBid {
  const CaseBid({
    required this.id,
    required this.caseId,
    required this.attorneyId,
    required this.status,
    required this.feeType,
    required this.amountCents,
    required this.message,
    required this.startAvailability,
    required this.startDate,
    required this.estimatedDurationDays,
    required this.roundCount,
    required this.turn,
    required this.createdAt,
    this.decidedAt,
    this.attorney,
    this.offers = const [],
  });

  final String id;
  final String caseId;
  final String attorneyId;
  final BidStatus status;
  final FeeType feeType;
  final int amountCents;
  final String message;
  final StartAvailability startAvailability;
  final DateTime? startDate;
  final int? estimatedDurationDays;
  final int roundCount;
  final PartyRole turn;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final BidAttorney? attorney;
  final List<BidOffer> offers;

  bool get isActive => status == BidStatus.active;
  bool get isFreeConsultation => feeType == FeeType.freeConsultation;

  /// §6.1: counters are possible below the cap and never for free
  /// consultations.
  bool get canCounter =>
      isActive && !isFreeConsultation && roundCount < kMaxNegotiationRounds;

  bool isTurnOf(PartyRole role) => isActive && turn == role;
}

/// Attorney feed card and detail (docs/04 §4.2, §4.3). No client field
/// ever exists here.
@immutable
class FeedCase {
  const FeedCase({
    required this.id,
    required this.title,
    required this.practice,
    required this.primaryStateCode,
    required this.additionalStateCodes,
    required this.city,
    required this.status,
    required this.budget,
    required this.viewCount,
    required this.bidsCount,
    required this.createdAt,
    required this.isNew,
    required this.hasOwnBid,
    this.description,
    this.excerpt = '',
    this.isSaved = false,
    this.ownBidId,
    this.photos = const [],
    this.photosCount = 0,
    this.commentCount = 0,
  });

  /// OQ-034: comments under the case.
  final int commentCount;

  final String id;
  final String title;
  final PracticeRef practice;
  final String primaryStateCode;
  final List<String> additionalStateCodes;
  final String? city;
  final CaseStatus status;
  final CaseBudget budget;
  final int viewCount;
  final int bidsCount;
  final DateTime createdAt;
  final bool isNew;
  final bool hasOwnBid;

  /// OQ-031: photos — only once this attorney's bid was accepted.
  final List<CasePhoto> photos;

  /// OQ-031: how many photos the case has (every attorney sees this).
  final int photosCount;
  final String? description;

  /// Owner 2026-09-30: short description preview for the feed card.
  final String excerpt;
  final bool isSaved;

  /// The attorney's own bid (detail only, §4.3).
  final String? ownBidId;

  FeedCase copyWith({bool? isSaved}) => FeedCase(
        id: id,
        title: title,
        practice: practice,
        primaryStateCode: primaryStateCode,
        additionalStateCodes: additionalStateCodes,
        city: city,
        status: status,
        budget: budget,
        viewCount: viewCount,
        bidsCount: bidsCount,
        createdAt: createdAt,
        isNew: isNew,
        hasOwnBid: hasOwnBid,
        description: description,
        isSaved: isSaved ?? this.isSaved,
        ownBidId: ownBidId,
        excerpt: excerpt,
        photos: photos,
        photosCount: photosCount,
        commentCount: commentCount,
      );
}

/// "Мои биды" row (docs/04 §11.2).
@immutable
class MyBid {
  const MyBid({
    required this.bid,
    required this.caseId,
    required this.caseTitle,
    required this.caseStatus,
    required this.casePracticeI18nKey,
    required this.casePracticeNameEn,
    required this.primaryStateCode,
    required this.lastOffer,
  });

  final CaseBid bid;
  final String caseId;
  final String caseTitle;
  final CaseStatus caseStatus;
  final String casePracticeI18nKey;
  final String casePracticeNameEn;
  final String primaryStateCode;
  final BidOffer lastOffer;
}

/// "В работе" / "Завершённые" row (docs/04 §11.2).
@immutable
class WorkItem {
  const WorkItem({
    required this.caseId,
    required this.bidId,
    required this.title,
    required this.status,
    required this.clientName,
    required this.feeType,
    required this.amountCents,
    this.autoCloseAt,
    this.acceptedAt,
    this.closedAt,
  });

  final String caseId;
  final String bidId;
  final String title;
  final CaseStatus status;

  /// Null while the subscription is inactive (§8.3).
  final String? clientName;
  final FeeType feeType;
  final int amountCents;
  final DateTime? autoCloseAt;
  final DateTime? acceptedAt;
  final DateTime? closedAt;
}

/// "Сохранённое" row (docs/04 §11.2): an available case or "Кейс
/// недоступен".
@immutable
class SavedCase {
  const SavedCase({
    required this.caseId,
    required this.savedAt,
    required this.available,
    this.title,
    this.card,
  });

  final String caseId;
  final DateTime savedAt;
  final bool available;
  final String? title;
  final FeedCase? card;
}

/// Client contacts after acceptance (docs/04 §8.1).
@immutable
class ClientContacts {
  const ClientContacts({
    required this.caseId,
    required this.bidId,
    required this.firstName,
    required this.lastName,
    required this.phone,
    required this.email,
    required this.contactMethod,
    required this.contactNote,
    required this.disclosedAt,
  });

  final String caseId;
  final String bidId;
  final String? firstName;
  final String? lastName;
  final String? phone;
  final String? email;
  final ContactMethod? contactMethod;
  final String? contactNote;
  final DateTime disclosedAt;

  String get fullName => [firstName, lastName]
      .whereType<String>()
      .where((s) => s.isNotEmpty)
      .join(' ');
}

/// docs/04 §8.4 "Не могу связаться" reasons.
const List<ContactIssueType> kContactIssueTypes = [
  ContactIssueType.phoneInvalid,
  ContactIssueType.noAnswer,
  ContactIssueType.emailBounce,
  ContactIssueType.wrongPerson,
  ContactIssueType.other,
];

/// The pre-acceptance / active chat of a case (docs/04 §9).
@immutable
class CaseConversation {
  const CaseConversation({
    required this.id,
    required this.contactsUnlocked,
  });

  final String id;
  final bool contactsUnlocked;
}

/// "История кейсов" (docs/04 §12).
@immutable
class HistoryCase {
  const HistoryCase({
    required this.id,
    required this.title,
    required this.practiceI18nKey,
    required this.practiceNameEn,
    required this.primaryStateCode,
    required this.status,
    required this.deleted,
    required this.createdAt,
    this.closedAt,
    this.archivedAt,
    this.acceptedAmountCents,
    this.acceptedFeeType,
  });

  final String id;
  final String title;
  final String practiceI18nKey;
  final String practiceNameEn;
  final String primaryStateCode;
  final CaseStatus status;
  final bool deleted;
  final DateTime createdAt;
  final DateTime? closedAt;
  final DateTime? archivedAt;
  final int? acceptedAmountCents;
  final FeeType? acceptedFeeType;
}

enum HistoryActor { client, attorney, admin, system }

@immutable
class HistoryEvent {
  const HistoryEvent({
    required this.id,
    required this.eventType,
    required this.createdAt,
    required this.actor,
    this.amountCents,
    this.feeType,
    this.roundNo,
    this.reason,
  });

  final String id;
  final String eventType;
  final DateTime createdAt;
  final HistoryActor actor;
  final int? amountCents;
  final FeeType? feeType;
  final int? roundNo;
  final String? reason;
}

@immutable
class HistoryCaseDetail {
  const HistoryCaseDetail({
    required this.item,
    required this.clientName,
    required this.events,
  });

  final HistoryCase item;

  /// Null → "Client" (docs/04 §12, attorney without disclosed contacts).
  final String? clientName;
  final List<HistoryEvent> events;
}

enum HistoryExportStatus { queued, ready, failed }

@immutable
class HistoryExport {
  const HistoryExport({
    required this.exportId,
    required this.status,
    this.url,
    this.expiresAt,
  });

  final String exportId;
  final HistoryExportStatus status;
  final String? url;
  final DateTime? expiresAt;
}

/// Filters of "Мои кейсы" (docs/04 §11.1).
enum MyCasesFilter { active, archived, closed }

/// Sort of a case's bid list (docs/04 §5.2).
enum BidsSort { newest, lowestPrice, highestRating }

enum MyBidsFilter { active, finished }

enum WorkFilter { active, closed }
