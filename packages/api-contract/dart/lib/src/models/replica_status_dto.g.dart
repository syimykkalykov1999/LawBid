// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'replica_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReplicaStatusDto _$ReplicaStatusDtoFromJson(Map<String, dynamic> json) =>
    ReplicaStatusDto(
      state: ReplicaStatusDtoState.fromJson(json['state'] as String),
      lagSeconds: json['lagSeconds'] as num?,
      instanceClass: json['instanceClass'] as String?,
      serving: json['serving'] as bool,
      note: json['note'] as String,
    );

Map<String, dynamic> _$ReplicaStatusDtoToJson(ReplicaStatusDto instance) =>
    <String, dynamic>{
      'state': instance.state.toJson(),
      'lagSeconds': ?instance.lagSeconds,
      'instanceClass': ?instance.instanceClass,
      'serving': instance.serving,
      'note': instance.note,
    };
