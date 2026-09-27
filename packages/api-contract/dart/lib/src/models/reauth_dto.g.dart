// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reauth_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReauthDto _$ReauthDtoFromJson(Map<String, dynamic> json) => ReauthDto(
  method: ReauthDtoMethod.fromJson(json['method'] as String),
  identifier: json['identifier'] as String,
  code: json['code'] as String,
);

Map<String, dynamic> _$ReauthDtoToJson(ReauthDto instance) => <String, dynamic>{
  'method': instance.method.toJson(),
  'identifier': instance.identifier,
  'code': instance.code,
};
