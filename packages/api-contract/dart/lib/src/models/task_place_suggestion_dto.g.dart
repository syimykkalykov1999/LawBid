// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_place_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskPlaceSuggestionDto _$TaskPlaceSuggestionDtoFromJson(
  Map<String, dynamic> json,
) => TaskPlaceSuggestionDto(
  address: json['address'] as String,
  uses: json['uses'] as num,
  label: json['label'] as String?,
);

Map<String, dynamic> _$TaskPlaceSuggestionDtoToJson(
  TaskPlaceSuggestionDto instance,
) => <String, dynamic>{
  'address': instance.address,
  'label': ?instance.label,
  'uses': instance.uses,
};
