// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_feed_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseFeedItemDto _$CaseFeedItemDtoFromJson(Map<String, dynamic> json) =>
    CaseFeedItemDto(
      id: json['id'] as String,
      title: json['title'] as String,
      excerpt: json['excerpt'] as String,
      practiceArea: CasePracticeAreaDto.fromJson(
        json['practiceArea'] as Map<String, dynamic>,
      ),
      primaryStateCode: json['primaryStateCode'] as String,
      additionalStateCodes: (json['additionalStateCodes'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      status: CaseStatus.fromJson(json['status'] as String),
      budget: CaseBudgetDto.fromJson(json['budget'] as Map<String, dynamic>),
      viewCount: (json['viewCount'] as num).toInt(),
      bidsCount: (json['bidsCount'] as num).toInt(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      isNew: json['isNew'] as bool,
      hasOwnBid: json['hasOwnBid'] as bool,
      commentCount: (json['commentCount'] as num).toInt(),
      shareCount: (json['shareCount'] as num).toInt(),
      isSaved: json['isSaved'] as bool,
      promoted: json['promoted'] as bool,
      priorityClient: json['priorityClient'] as bool,
      dossier: CaseDossierDto.fromJson(json['dossier'] as Map<String, dynamic>),
      city: json['city'] as String?,
      coverKey: json['coverKey'] as String?,
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
    );

Map<String, dynamic> _$CaseFeedItemDtoToJson(CaseFeedItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'excerpt': instance.excerpt,
      'practiceArea': instance.practiceArea.toJson(),
      'primaryStateCode': instance.primaryStateCode,
      'additionalStateCodes': instance.additionalStateCodes,
      'city': ?instance.city,
      'status': instance.status.toJson(),
      'budget': instance.budget.toJson(),
      'coverKey': ?instance.coverKey,
      'urgency': ?instance.urgency?.toJson(),
      'urgencyLevel': ?instance.urgencyLevel?.toJson(),
      'deadlineAt': ?instance.deadlineAt?.toIso8601String(),
      'deadlineKind': ?instance.deadlineKind?.toJson(),
      'viewCount': instance.viewCount,
      'bidsCount': instance.bidsCount,
      'createdAt': instance.createdAt.toIso8601String(),
      'isNew': instance.isNew,
      'hasOwnBid': instance.hasOwnBid,
      'commentCount': instance.commentCount,
      'shareCount': instance.shareCount,
      'isSaved': instance.isSaved,
      'promoted': instance.promoted,
      'priorityClient': instance.priorityClient,
      'dossier': instance.dossier.toJson(),
    };
