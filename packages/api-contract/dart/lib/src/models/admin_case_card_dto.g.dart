// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_case_card_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCaseCardDto _$AdminCaseCardDtoFromJson(Map<String, dynamic> json) =>
    AdminCaseCardDto(
      imagesCount: (json['imagesCount'] as num).toInt(),
      title: json['title'] as String,
      status: AdminCaseCardDtoStatus.fromJson(json['status'] as String),
      clientId: json['clientId'] as String,
      clientName: json['clientName'] as String,
      practiceAreaId: json['practiceAreaId'] as String,
      practiceAreaName: json['practiceAreaName'] as String,
      stateCode: json['stateCode'] as String,
      bidsCount: (json['bidsCount'] as num).toInt(),
      commentCount: (json['commentCount'] as num).toInt(),
      viewCount: (json['viewCount'] as num).toInt(),
      openReports: (json['openReports'] as num).toInt(),
      promoted: json['promoted'] as bool,
      id: json['id'] as String,
      documentsCount: (json['documentsCount'] as num).toInt(),
      dossierScore: (json['dossierScore'] as num).toInt(),
      dossierMissing: (json['dossierMissing'] as List<dynamic>)
          .map((e) => AdminCaseCardDtoDossierMissing.fromJson(e as String))
          .toList(),
      urgency: json['urgency'] == null
          ? null
          : CaseUrgency.fromJson(json['urgency'] as String),
      urgencyLevel: json['urgencyLevel'] == null
          ? null
          : CaseUrgencyLevel.fromJson(json['urgencyLevel'] as String),
      deadlineAt: json['deadlineAt'] == null
          ? null
          : DateTime.parse(json['deadlineAt'] as String),
      deadlineKind: json['deadlineKind'] == null
          ? null
          : CaseDeadlineKind.fromJson(json['deadlineKind'] as String),
      lastActivityAt: DateTime.parse(json['lastActivityAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      description: json['description'] as String,
      city: json['city'] as String?,
      promotedUntil: json['promotedUntil'] == null
          ? null
          : DateTime.parse(json['promotedUntil'] as String),
      budgetCents: (json['budgetCents'] as num?)?.toInt(),
      client: AdminPartyDto.fromJson(json['client'] as Map<String, dynamic>),
      states: (json['states'] as List<dynamic>)
          .map((e) => AdminCaseStateDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      photosCount: (json['photosCount'] as num).toInt(),
      acceptedBidId: json['acceptedBidId'] as String?,
      bids: (json['bids'] as List<dynamic>)
          .map((e) => AdminCaseBidDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      invites: (json['invites'] as List<dynamic>)
          .map((e) => AdminCaseInviteDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      journal: (json['journal'] as List<dynamic>)
          .map((e) => AdminJournalEntryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      disputeIds: (json['disputeIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      contactIssueIds: (json['contactIssueIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      archivedAt: json['archivedAt'] == null
          ? null
          : DateTime.parse(json['archivedAt'] as String),
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.parse(json['closedAt'] as String),
      budgetMode: AdminCaseCardDtoBudgetMode.fromJson(
        json['budgetMode'] as String,
      ),
    );

Map<String, dynamic> _$AdminCaseCardDtoToJson(AdminCaseCardDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'status': instance.status.toJson(),
      'clientId': instance.clientId,
      'clientName': instance.clientName,
      'practiceAreaId': instance.practiceAreaId,
      'practiceAreaName': instance.practiceAreaName,
      'stateCode': instance.stateCode,
      'bidsCount': instance.bidsCount,
      'commentCount': instance.commentCount,
      'viewCount': instance.viewCount,
      'openReports': instance.openReports,
      'promoted': instance.promoted,
      'imagesCount': instance.imagesCount,
      'documentsCount': instance.documentsCount,
      'dossierScore': instance.dossierScore,
      'dossierMissing': instance.dossierMissing.map((e) => e.toJson()).toList(),
      'urgency': ?instance.urgency?.toJson(),
      'urgencyLevel': ?instance.urgencyLevel?.toJson(),
      'deadlineAt': ?instance.deadlineAt?.toIso8601String(),
      'deadlineKind': ?instance.deadlineKind?.toJson(),
      'lastActivityAt': instance.lastActivityAt.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'description': instance.description,
      'city': ?instance.city,
      'budgetMode': instance.budgetMode.toJson(),
      'budgetCents': ?instance.budgetCents,
      'client': instance.client.toJson(),
      'states': instance.states.map((e) => e.toJson()).toList(),
      'photosCount': instance.photosCount,
      'acceptedBidId': ?instance.acceptedBidId,
      'bids': instance.bids.map((e) => e.toJson()).toList(),
      'invites': instance.invites.map((e) => e.toJson()).toList(),
      'journal': instance.journal.map((e) => e.toJson()).toList(),
      'disputeIds': instance.disputeIds,
      'contactIssueIds': instance.contactIssueIds,
      'archivedAt': ?instance.archivedAt?.toIso8601String(),
      'closedAt': ?instance.closedAt?.toIso8601String(),
      'promotedUntil': ?instance.promotedUntil?.toIso8601String(),
    };
