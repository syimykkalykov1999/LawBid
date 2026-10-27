// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reveal_pii_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RevealPiiDto _$RevealPiiDtoFromJson(Map<String, dynamic> json) => RevealPiiDto(
  targetType: RevealPiiDtoTargetType.fromJson(json['targetType'] as String),
  targetId: json['targetId'] as String,
  field: RevealPiiDtoField.fromJson(json['field'] as String),
);

Map<String, dynamic> _$RevealPiiDtoToJson(RevealPiiDto instance) =>
    <String, dynamic>{
      'targetType': instance.targetType.toJson(),
      'targetId': instance.targetId,
      'field': instance.field.toJson(),
    };
