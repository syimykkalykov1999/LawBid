// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'address_suggestion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddressSuggestionDto _$AddressSuggestionDtoFromJson(
  Map<String, dynamic> json,
) => AddressSuggestionDto(
  label: json['label'] as String,
  city: json['city'] as String?,
  stateCode: json['stateCode'] as String?,
);

Map<String, dynamic> _$AddressSuggestionDtoToJson(
  AddressSuggestionDto instance,
) => <String, dynamic>{
  'label': instance.label,
  'city': ?instance.city,
  'stateCode': ?instance.stateCode,
};
