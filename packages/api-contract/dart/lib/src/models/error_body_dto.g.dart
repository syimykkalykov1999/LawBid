// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'error_body_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ErrorBodyDto _$ErrorBodyDtoFromJson(Map<String, dynamic> json) => ErrorBodyDto(
  code: ErrorCode.fromJson(json['code'] as String),
  message: json['message'] as String,
  requestId: json['requestId'] as String,
  details: json['details'],
);

Map<String, dynamic> _$ErrorBodyDtoToJson(ErrorBodyDto instance) =>
    <String, dynamic>{
      'code': instance.code.toJson(),
      'message': instance.message,
      'details': ?instance.details,
      'requestId': instance.requestId,
    };
