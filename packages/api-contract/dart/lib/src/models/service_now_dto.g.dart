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
    );

Map<String, dynamic> _$ServiceNowDtoToJson(ServiceNowDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'running': instance.running,
      'desired': instance.desired,
      'spot': ?instance.spot,
    };
