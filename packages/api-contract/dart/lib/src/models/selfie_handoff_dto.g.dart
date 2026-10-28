// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'selfie_handoff_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SelfieHandoffDto _$SelfieHandoffDtoFromJson(Map<String, dynamic> json) =>
    SelfieHandoffDto(
      sent: json['sent'] as bool,
      phoneLast4: json['phoneLast4'] as String,
      reason: json['reason'] == null
          ? null
          : SelfieHandoffDtoReason.fromJson(json['reason'] as String),
    );

Map<String, dynamic> _$SelfieHandoffDtoToJson(SelfieHandoffDto instance) =>
    <String, dynamic>{
      'sent': instance.sent,
      'phoneLast4': instance.phoneLast4,
      'reason': ?instance.reason?.toJson(),
    };
