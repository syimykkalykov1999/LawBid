// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_team_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTeamRowDto _$AdminTeamRowDtoFromJson(Map<String, dynamic> json) =>
    AdminTeamRowDto(
      attorneyId: json['attorneyId'] as String,
      attorneyName: json['attorneyName'] as String,
      plan: AdminTeamRowDtoPlan.fromJson(json['plan'] as String),
      seats: (json['seats'] as num).toInt(),
      active: (json['active'] as num).toInt(),
      invited: (json['invited'] as num).toInt(),
      pendingRequests: (json['pendingRequests'] as num).toInt(),
      openTasks: (json['openTasks'] as num).toInt(),
      username: json['username'] as String?,
    );

Map<String, dynamic> _$AdminTeamRowDtoToJson(AdminTeamRowDto instance) =>
    <String, dynamic>{
      'attorneyId': instance.attorneyId,
      'attorneyName': instance.attorneyName,
      'username': ?instance.username,
      'plan': instance.plan.toJson(),
      'seats': instance.seats,
      'active': instance.active,
      'invited': instance.invited,
      'pendingRequests': instance.pendingRequests,
      'openTasks': instance.openTasks,
    };
