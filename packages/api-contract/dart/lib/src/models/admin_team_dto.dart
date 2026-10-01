// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'activity_dto.dart';
import 'admin_team_dto_plan.dart';
import 'assistant_member_dto.dart';

part 'admin_team_dto.g.dart';

@JsonSerializable()
class AdminTeamDto {
  const AdminTeamDto({
    required this.attorneyId,
    required this.attorneyName,
    required this.plan,
    required this.seats,
    required this.active,
    required this.invited,
    required this.pendingRequests,
    required this.openTasks,
    required this.members,
    required this.activity,
    this.username,
  });

  factory AdminTeamDto.fromJson(Map<String, Object?> json) =>
      _$AdminTeamDtoFromJson(json);

  final String attorneyId;
  final String attorneyName;
  final String? username;
  final AdminTeamDtoPlan plan;
  final int seats;
  final int active;
  final int invited;
  final int pendingRequests;
  final int openTasks;
  final List<AssistantMemberDto> members;

  /// Last 100 actions.
  final List<ActivityDto> activity;

  Map<String, Object?> toJson() => _$AdminTeamDtoToJson(this);
}
