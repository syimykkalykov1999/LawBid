// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'contact_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ContactRequestDto _$ContactRequestDtoFromJson(Map<String, dynamic> json) =>
    ContactRequestDto(
      type: ContactRequestDtoType.fromJson(json['type'] as String),
      value: json['value'] as String,
    );

Map<String, dynamic> _$ContactRequestDtoToJson(ContactRequestDto instance) =>
    <String, dynamic>{'type': instance.type.toJson(), 'value': instance.value};
