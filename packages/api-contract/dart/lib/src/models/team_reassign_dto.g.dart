// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'team_reassign_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TeamReassignDto _$TeamReassignDtoFromJson(Map<String, dynamic> json) =>
    TeamReassignDto(
      kind: LeaseQueueKind.fromJson(json['kind'] as String),
      itemId: json['itemId'] as String,
      toAdminId: json['toAdminId'] as String,
      reason: json['reason'] as String?,
    );

Map<String, dynamic> _$TeamReassignDtoToJson(TeamReassignDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'itemId': instance.itemId,
      'toAdminId': instance.toAdminId,
      'reason': ?instance.reason,
    };
