// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_team_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTeamDto _$AdminTeamDtoFromJson(Map<String, dynamic> json) => AdminTeamDto(
  attorneyId: json['attorneyId'] as String,
  attorneyName: json['attorneyName'] as String,
  plan: AdminTeamDtoPlan.fromJson(json['plan'] as String),
  seats: (json['seats'] as num).toInt(),
  active: (json['active'] as num).toInt(),
  invited: (json['invited'] as num).toInt(),
  pendingRequests: (json['pendingRequests'] as num).toInt(),
  openTasks: (json['openTasks'] as num).toInt(),
  members: (json['members'] as List<dynamic>)
      .map((e) => AssistantMemberDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  activity: (json['activity'] as List<dynamic>)
      .map((e) => ActivityDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  username: json['username'] as String?,
);

Map<String, dynamic> _$AdminTeamDtoToJson(AdminTeamDto instance) =>
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
      'members': instance.members.map((e) => e.toJson()).toList(),
      'activity': instance.activity.map((e) => e.toJson()).toList(),
    };
