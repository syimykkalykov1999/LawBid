// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_team_row_dto_plan.dart';

part 'admin_team_row_dto.g.dart';

@JsonSerializable()
class AdminTeamRowDto {
  const AdminTeamRowDto({
    required this.attorneyId,
    required this.attorneyName,
    required this.plan,
    required this.seats,
    required this.active,
    required this.invited,
    required this.pendingRequests,
    required this.openTasks,
    this.username,
  });

  factory AdminTeamRowDto.fromJson(Map<String, Object?> json) =>
      _$AdminTeamRowDtoFromJson(json);

  final String attorneyId;
  final String attorneyName;
  final String? username;
  final AdminTeamRowDtoPlan plan;
  final int seats;
  final int active;
  final int invited;
  final int pendingRequests;
  final int openTasks;

  Map<String, Object?> toJson() => _$AdminTeamRowDtoToJson(this);
}
