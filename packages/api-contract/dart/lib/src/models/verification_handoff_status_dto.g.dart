// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_handoff_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationHandoffStatusDto _$VerificationHandoffStatusDtoFromJson(
  Map<String, dynamic> json,
) => VerificationHandoffStatusDto(
  status: VerificationHandoffStatus.fromJson(json['status'] as String),
  requestId: json['requestId'] as String,
  expiresAt: DateTime.parse(json['expiresAt'] as String),
);

Map<String, dynamic> _$VerificationHandoffStatusDtoToJson(
  VerificationHandoffStatusDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'requestId': instance.requestId,
  'expiresAt': instance.expiresAt.toIso8601String(),
};
