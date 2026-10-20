// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_hold_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalHoldDto _$LegalHoldDtoFromJson(Map<String, dynamic> json) => LegalHoldDto(
  id: json['id'] as String,
  requestId: json['requestId'] as String,
  targetType: LegalHoldDtoTargetType.fromJson(json['targetType'] as String),
  targetId: json['targetId'] as String,
  createdAt: json['createdAt'] as String,
  expiresAt: json['expiresAt'] as String?,
  releasedAt: json['releasedAt'] as String?,
);

Map<String, dynamic> _$LegalHoldDtoToJson(LegalHoldDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'requestId': instance.requestId,
      'targetType': instance.targetType.toJson(),
      'targetId': instance.targetId,
      'createdAt': instance.createdAt,
      'expiresAt': ?instance.expiresAt,
      'releasedAt': ?instance.releasedAt,
    };
