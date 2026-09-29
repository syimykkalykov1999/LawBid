// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_case_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedCaseItemDto _$SavedCaseItemDtoFromJson(Map<String, dynamic> json) =>
    SavedCaseItemDto(
      caseId: json['caseId'] as String,
      savedAt: json['savedAt'] as String,
      available: json['available'] as bool,
      title: json['title'] as String?,
      caseValue: json['case'] == null
          ? null
          : CaseFeedItemDto.fromJson(json['case'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SavedCaseItemDtoToJson(SavedCaseItemDto instance) =>
    <String, dynamic>{
      'caseId': instance.caseId,
      'savedAt': instance.savedAt,
      'available': instance.available,
      'title': ?instance.title,
      'case': ?instance.caseValue?.toJson(),
    };
