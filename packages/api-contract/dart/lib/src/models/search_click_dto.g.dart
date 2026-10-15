// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_click_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchClickDto _$SearchClickDtoFromJson(Map<String, dynamic> json) =>
    SearchClickDto(
      q: json['q'] as String,
      targetType: SearchClickDtoTargetType.fromJson(
        json['targetType'] as String,
      ),
      targetId: json['targetId'] as String,
    );

Map<String, dynamic> _$SearchClickDtoToJson(SearchClickDto instance) =>
    <String, dynamic>{
      'q': instance.q,
      'targetType': instance.targetType.toJson(),
      'targetId': instance.targetId,
    };
