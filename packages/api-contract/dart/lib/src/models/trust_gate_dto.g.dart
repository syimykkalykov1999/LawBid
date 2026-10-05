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
  missing: (json['missing'] as List<dynamic>)
      .map((e) => TrustGateDtoMissing.fromJson(e as String))
      .toList(),
  current: (json['current'] as num).toInt(),
  hold: json['hold'] as String?,
);

Map<String, dynamic> _$TrustGateDtoToJson(TrustGateDto instance) =>
    <String, dynamic>{
      'ok': instance.ok,
      'reason': ?instance.reason?.toJson(),
      'missing': instance.missing.map((e) => e.toJson()).toList(),
      'current': instance.current,
      'hold': ?instance.hold,
    };
