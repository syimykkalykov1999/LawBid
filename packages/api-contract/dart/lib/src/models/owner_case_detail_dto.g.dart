// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'owner_case_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnerCaseDetailDto _$OwnerCaseDetailDtoFromJson(Map<String, dynamic> json) =>
    OwnerCaseDetailDto(
      status: CaseStatus.fromJson(json['status'] as String),
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
      stillNeededPending: json['stillNeededPending'] as bool,
      photos: (json['photos'] as List<dynamic>)
          .map((e) => CasePhotoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      canMakeNotUrgent: json['canMakeNotUrgent'] as bool,
      lastActivityAt: json['lastActivityAt'] as String,
      createdAt: json['createdAt'] as String,
      bidsCount: (json['bidsCount'] as num).toInt(),
      viewCount: (json['viewCount'] as num).toInt(),
      coverKey: json['coverKey'] as String?,
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
      clientCompletedAt: json['clientCompletedAt'] as String?,
      attorneyConfirmedAt: json['attorneyConfirmedAt'] as String?,
      autoCloseAt: json['autoCloseAt'] as String?,
      closedAt: json['closedAt'] as String?,
      deletedAt: json['deletedAt'] as String?,
      stalePromptSentAt: json['stalePromptSentAt'] as String?,
      pausedAt: json['pausedAt'] as String?,
      budgetCents: (json['budgetCents'] as num?)?.toInt(),
      city: json['city'] as String?,
      acceptedBid: json['acceptedBid'] == null
          ? null
          : CaseBidItemDto.fromJson(
              json['acceptedBid'] as Map<String, dynamic>,
            ),
      conversationId: json['conversationId'] as String?,
      archivedAt: json['archivedAt'] as String?,
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
      'acceptedBid': ?instance.acceptedBid?.toJson(),
      'conversationId': ?instance.conversationId,
      'photos': instance.photos.map((e) => e.toJson()).toList(),
    };
