// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_handoff_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationHandoffDto _$VerificationHandoffDtoFromJson(
  Map<String, dynamic> json,
) => VerificationHandoffDto(
  token: json['token'] as String,
  url: json['url'] as String,
  qrPayload: json['qrPayload'] as String,
  expiresAt: DateTime.parse(json['expiresAt'] as String),
);

Map<String, dynamic> _$VerificationHandoffDtoToJson(
  VerificationHandoffDto instance,
) => <String, dynamic>{
  'token': instance.token,
  'url': instance.url,
  'qrPayload': instance.qrPayload,
  'expiresAt': instance.expiresAt.toIso8601String(),
};
