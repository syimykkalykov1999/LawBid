// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_gate_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustGateDto _$TrustGateDtoFromJson(Map<String, dynamic> json) => TrustGateDto(
  ok: json['ok'] as bool,
  reason: json['reason'] == null
      ? null
      : TrustGateDtoReason.fromJson(json['reason'] as String),
  requiredValue: (json['required'] as num).toInt(),
  current: (json['current'] as num).toInt(),
  hold: json['hold'] as String?,
);

Map<String, dynamic> _$TrustGateDtoToJson(TrustGateDto instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'reason': ?instance.reason?.toJson(),
      'required': instance.requiredValue,
      'current': instance.current,
      'hold': ?instance.hold,
    };
