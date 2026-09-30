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
      city: json['city'] as String?,
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
      'viewCount': instance.viewCount,
      'bidsCount': instance.bidsCount,
      'createdAt': instance.createdAt.toIso8601String(),
      'isNew': instance.isNew,
      'hasOwnBid': instance.hasOwnBid,
      'commentCount': instance.commentCount,
      'shareCount': instance.shareCount,
      'isSaved': instance.isSaved,
    };
