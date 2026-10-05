// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustEventDto _$TrustEventDtoFromJson(Map<String, dynamic> json) =>
    TrustEventDto(
      id: json['id'] as String,
      kind: json['kind'] as String,
      fromLevel: (json['fromLevel'] as num?)?.toInt(),
      toLevel: (json['toLevel'] as num?)?.toInt(),
      actorType: json['actorType'] as String,
      actorId: json['actorId'] as String?,
      details: json['details'],
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$TrustEventDtoToJson(TrustEventDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'kind': instance.kind,
      'fromLevel': ?instance.fromLevel,
      'toLevel': ?instance.toLevel,
      'actorType': instance.actorType,
      'actorId': ?instance.actorId,
      'details': ?instance.details,
      'createdAt': instance.createdAt.toIso8601String(),
    };
