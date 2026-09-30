// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'owner_case_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OwnerCaseDetailDto _$OwnerCaseDetailDtoFromJson(Map<String, dynamic> json) =>
    OwnerCaseDetailDto(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String,
      practiceArea: PracticeAreaRefDto.fromJson(
        json['practiceArea'] as Map<String, dynamic>,
      ),
      primaryStateCode: json['primaryStateCode'] as String,
      states: (json['states'] as List<dynamic>)
          .map((e) => CaseStateDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      budgetMode: BudgetMode.fromJson(json['budgetMode'] as String),
      status: CaseStatus.fromJson(json['status'] as String),
      viewCount: (json['viewCount'] as num).toInt(),
      bidsCount: (json['bidsCount'] as num).toInt(),
      createdAt: json['createdAt'] as String,
      lastActivityAt: json['lastActivityAt'] as String,
      photos: (json['photos'] as List<dynamic>)
          .map((e) => CasePhotoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      city: json['city'] as String?,
      budgetCents: (json['budgetCents'] as num?)?.toInt(),
      archivedAt: json['archivedAt'] as String?,
      clientCompletedAt: json['clientCompletedAt'] as String?,
      attorneyConfirmedAt: json['attorneyConfirmedAt'] as String?,
      autoCloseAt: json['autoCloseAt'] as String?,
      closedAt: json['closedAt'] as String?,
      deletedAt: json['deletedAt'] as String?,
      acceptedBid: json['acceptedBid'] == null
          ? null
          : CaseBidItemDto.fromJson(
              json['acceptedBid'] as Map<String, dynamic>,
            ),
      conversationId: json['conversationId'] as String?,
    );

Map<String, dynamic> _$OwnerCaseDetailDtoToJson(OwnerCaseDetailDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'description': instance.description,
      'practiceArea': instance.practiceArea.toJson(),
      'primaryStateCode': instance.primaryStateCode,
      'states': instance.states.map((e) => e.toJson()).toList(),
      'city': ?instance.city,
      'budgetMode': instance.budgetMode.toJson(),
      'budgetCents': ?instance.budgetCents,
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
      'acceptedBid': ?instance.acceptedBid?.toJson(),
      'conversationId': ?instance.conversationId,
      'photos': instance.photos.map((e) => e.toJson()).toList(),
    };
