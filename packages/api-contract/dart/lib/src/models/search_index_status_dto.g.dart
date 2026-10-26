// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_index_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchIndexStatusDto _$SearchIndexStatusDtoFromJson(
  Map<String, dynamic> json,
) => SearchIndexStatusDto(
  engineConfigured: json['engineConfigured'] as bool,
  mappingVersion: json['mappingVersion'] as num,
  phase: json['phase'] == null
      ? null
      : SearchIndexStatusDtoPhase.fromJson(json['phase'] as String),
  source: json['source'] == null
      ? null
      : SearchIndexStatusDtoSource.fromJson(json['source'] as String),
  startedAt: json['startedAt'] as String?,
  error: json['error'] as String?,
  progressEntity: json['progressEntity'] == null
      ? null
      : SearchIndexStatusDtoProgressEntity.fromJson(
          json['progressEntity'] as String,
        ),
  progressIndexed: json['progressIndexed'] as num,
  progressTotal: json['progressTotal'] as num,
  progressDone: json['progressDone'] as num,
  verifyOk: json['verifyOk'] as bool?,
  verifiedAt: json['verifiedAt'] as String?,
  verify: (json['verify'] as List<dynamic>)
      .map((e) => SearchIndexVerifyDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  retainUntil: json['retainUntil'] as String?,
  nextSwap: json['nextSwap'] == null
      ? null
      : SearchIndexStatusDtoNextSwap.fromJson(json['nextSwap'] as String),
  canStart: json['canStart'] as bool,
  canSwap: json['canSwap'] as bool,
  canRollback: json['canRollback'] as bool,
  entities: (json['entities'] as List<dynamic>)
      .map((e) => SearchIndexEntityDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$SearchIndexStatusDtoToJson(
  SearchIndexStatusDto instance,
) => <String, dynamic>{
  'engineConfigured': instance.engineConfigured,
  'mappingVersion': instance.mappingVersion,
  'phase': ?instance.phase?.toJson(),
  'source': ?instance.source?.toJson(),
  'startedAt': ?instance.startedAt,
  'error': ?instance.error,
  'progressEntity': ?instance.progressEntity?.toJson(),
  'progressIndexed': instance.progressIndexed,
  'progressTotal': instance.progressTotal,
  'progressDone': instance.progressDone,
  'verifyOk': ?instance.verifyOk,
  'verifiedAt': ?instance.verifiedAt,
  'verify': instance.verify.map((e) => e.toJson()).toList(),
  'retainUntil': ?instance.retainUntil,
  'nextSwap': ?instance.nextSwap?.toJson(),
  'canStart': instance.canStart,
  'canSwap': instance.canSwap,
  'canRollback': instance.canRollback,
  'entities': instance.entities.map((e) => e.toJson()).toList(),
};
