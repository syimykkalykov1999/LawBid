// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bar_number_block_event_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BarNumberBlockEventDto _$BarNumberBlockEventDtoFromJson(
  Map<String, dynamic> json,
) => BarNumberBlockEventDto(
  id: json['id'] as String,
  kind: BarNumberBlockEventDtoKind.fromJson(json['kind'] as String),
  actorType: json['actorType'] as String,
  actor: json['actor'] == null
      ? null
      : StaffAdminDto.fromJson(json['actor'] as Map<String, dynamic>),
  reason: json['reason'] as String?,
  details: json['details'],
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$BarNumberBlockEventDtoToJson(
  BarNumberBlockEventDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind.toJson(),
  'actorType': instance.actorType,
  'actor': ?instance.actor?.toJson(),
  'reason': ?instance.reason,
  'details': ?instance.details,
  'createdAt': instance.createdAt.toIso8601String(),
};
