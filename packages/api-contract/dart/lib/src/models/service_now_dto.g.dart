// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'service_now_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ServiceNowDto _$ServiceNowDtoFromJson(Map<String, dynamic> json) =>
    ServiceNowDto(
      kind: ServiceNowDtoKind.fromJson(json['kind'] as String),
      running: json['running'] as num,
      desired: json['desired'] as num,
      spot: json['spot'] as bool?,
      baseValue: json['base'] as num?,
      fargateWeight: json['fargateWeight'] as num?,
      spotWeight: json['spotWeight'] as num?,
      min: json['min'] as num?,
      max: json['max'] as num?,
    );

Map<String, dynamic> _$ServiceNowDtoToJson(ServiceNowDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'running': instance.running,
      'desired': instance.desired,
      'spot': ?instance.spot,
      'base': ?instance.baseValue,
      'fargateWeight': ?instance.fargateWeight,
      'spotWeight': ?instance.spotWeight,
      'min': ?instance.min,
      'max': ?instance.max,
    };
