// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'owner_case_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnerCaseDetailDto _$OwnerCaseDetailDtoFromJson(Map<String, dynamic> json) =>
    OwnerCaseDetailDto(
      viewCount: (json['viewCount'] as num).toInt(),
      title: json['title'] as String,
      description: json['description'] as String,
      privateDetails: json['privateDetails'] as String?,
      practiceArea: PracticeAreaRefDto.fromJson(
        json['practiceArea'] as Map<String, dynamic>,
      ),
      extraPracticeAreas: (json['extraPracticeAreas'] as List<dynamic>)
          .map((e) => PracticeAreaRefDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      primaryStateCode: json['primaryStateCode'] as String,
      states: (json['states'] as List<dynamic>)
          .map((e) => CaseStateDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      budgetMode: BudgetMode.fromJson(json['budgetMode'] as String),
      id: json['id'] as String,
      photos: (json['photos'] as List<dynamic>)
          .map((e) => CasePhotoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      lastActivityAt: json['lastActivityAt'] as String,
      canMakeNotUrgent: json['canMakeNotUrgent'] as bool,
      createdAt: json['createdAt'] as String,
      bidsCount: (json['bidsCount'] as num).toInt(),
      stillNeededPending: json['stillNeededPending'] as bool,
      status: CaseStatus.fromJson(json['status'] as String),
      deadlineKind: json['deadlineKind'] == null
          ? null
          : CaseDeadlineKind.fromJson(json['deadlineKind'] as String),
      deadlineAt: json['deadlineAt'] == null
          ? null
          : DateTime.parse(json['deadlineAt'] as String),
      urgencyLevel: json['urgencyLevel'] == null
          ? null
          : CaseUrgencyLevel.fromJson(json['urgencyLevel'] as String),
      urgency: json['urgency'] == null
          ? null
          : CaseUrgency.fromJson(json['urgency'] as String),
      budgetPercentBps: (json['budgetPercentBps'] as num?)?.toInt(),
      archivedAt: json['archivedAt'] as String?,
      clientCompletedAt: json['clientCompletedAt'] as String?,
      budgetCents: (json['budgetCents'] as num?)?.toInt(),
      autoCloseAt: json['autoCloseAt'] as String?,
      closedAt: json['closedAt'] as String?,
      deletedAt: json['deletedAt'] as String?,
      stalePromptSentAt: json['stalePromptSentAt'] as String?,
      pausedAt: json['pausedAt'] as String?,
      attorneyConfirmedAt: json['attorneyConfirmedAt'] as String?,
      city: json['city'] as String?,
      hidesAt: json['hidesAt'] as String?,
      archivesAt: json['archivesAt'] as String?,
      acceptedBid: json['acceptedBid'] == null
          ? null
          : CaseBidItemDto.fromJson(
              json['acceptedBid'] as Map<String, dynamic>,
            ),
      conversationId: json['conversationId'] as String?,
      coverKey: json['coverKey'] as String?,
    );

Map<String, dynamic> _$OwnerCaseDetailDtoToJson(OwnerCaseDetailDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'description': instance.description,
      'privateDetails': ?instance.privateDetails,
      'practiceArea': instance.practiceArea.toJson(),
      'extraPracticeAreas': instance.extraPracticeAreas
          .map((e) => e.toJson())
          .toList(),
      'primaryStateCode': instance.primaryStateCode,
      'states': instance.states.map((e) => e.toJson()).toList(),
      'city': ?instance.city,
      'budgetMode': instance.budgetMode.toJson(),
      'budgetCents': ?instance.budgetCents,
      'budgetPercentBps': ?instance.budgetPercentBps,
      'coverKey': ?instance.coverKey,
      'urgency': ?instance.urgency?.toJson(),
      'urgencyLevel': ?instance.urgencyLevel?.toJson(),
      'deadlineAt': ?instance.deadlineAt?.toIso8601String(),
      'deadlineKind': ?instance.deadlineKind?.toJson(),
      'status': instance.status.toJson(),
      'viewCount': instance.viewCount,
      'bidsCount': instance.bidsCount,
      'createdAt': instance.createdAt,
      'lastActivityAt': instance.lastActivityAt,
      'archivedAt': ?instance.archivedAt,
      'clientCompletedAt': ?instance.clientCompletedAt,
      'attorneyConfirmedAt': ?instance.attorneyConfirmedAt,
      'autoCloseAt': ?instance.autoCloseAt,
      'closedAt': ?instance.closedAt,
      'deletedAt': ?instance.deletedAt,
      'stalePromptSentAt': ?instance.stalePromptSentAt,
      'pausedAt': ?instance.pausedAt,
      'stillNeededPending': instance.stillNeededPending,
      'canMakeNotUrgent': instance.canMakeNotUrgent,
      'hidesAt': ?instance.hidesAt,
      'archivesAt': ?instance.archivesAt,
      'acceptedBid': ?instance.acceptedBid?.toJson(),
      'conversationId': ?instance.conversationId,
      'photos': instance.photos.map((e) => e.toJson()).toList(),
    };
