// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_legal_hold_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateLegalHoldDto _$CreateLegalHoldDtoFromJson(Map<String, dynamic> json) =>
    CreateLegalHoldDto(
      targetType: CreateLegalHoldDtoTargetType.fromJson(
        json['targetType'] as String,
      ),
      targetId: json['targetId'] as String,
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$CreateLegalHoldDtoToJson(CreateLegalHoldDto instance) =>
    <String, dynamic>{
      'targetType': instance.targetType.toJson(),
      'targetId': instance.targetId,
      'expiresAt': ?instance.expiresAt?.toIso8601String(),
    };
