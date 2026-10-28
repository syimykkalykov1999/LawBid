// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'calls_path_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallsPathDto _$CallsPathDtoFromJson(Map<String, dynamic> json) => CallsPathDto(
  transport: CallsPathDtoTransport.fromJson(json['transport'] as String),
  carrying: CallsPathDtoCarrying.fromJson(json['carrying'] as String),
  breakers: CallsPathBreakersDto.fromJson(
    json['breakers'] as Map<String, dynamic>,
  ),
  cloudflare: CallsPathSideDto.fromJson(
    json['cloudflare'] as Map<String, dynamic>,
  ),
  own: CallsPathSideDto.fromJson(json['own'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CallsPathDtoToJson(CallsPathDto instance) =>
    <String, dynamic>{
      'transport': instance.transport.toJson(),
      'carrying': instance.carrying.toJson(),
      'breakers': instance.breakers.toJson(),
      'cloudflare': instance.cloudflare.toJson(),
      'own': instance.own.toJson(),
    };
