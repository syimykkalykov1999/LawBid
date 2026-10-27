// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reveal_pii_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RevealPiiResultDto _$RevealPiiResultDtoFromJson(Map<String, dynamic> json) =>
    RevealPiiResultDto(
      field: RevealPiiResultDtoField.fromJson(json['field'] as String),
      value: json['value'] as String,
      remainingToday: json['remainingToday'] as num?,
    );

Map<String, dynamic> _$RevealPiiResultDtoToJson(RevealPiiResultDto instance) =>
    <String, dynamic>{
      'field': instance.field.toJson(),
      'value': instance.value,
      'remainingToday': ?instance.remainingToday,
    };
