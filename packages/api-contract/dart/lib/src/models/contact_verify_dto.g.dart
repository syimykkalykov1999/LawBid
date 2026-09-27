// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_verify_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactVerifyDto _$ContactVerifyDtoFromJson(Map<String, dynamic> json) =>
    ContactVerifyDto(
      type: ContactVerifyDtoType.fromJson(json['type'] as String),
      value: json['value'] as String,
      code: json['code'] as String,
    );

Map<String, dynamic> _$ContactVerifyDtoToJson(ContactVerifyDto instance) =>
    <String, dynamic>{
      'type': instance.type.toJson(),
      'value': instance.value,
      'code': instance.code,
    };
