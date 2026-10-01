// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'assistant_member_dto.dart';
import 'team_dto_plan.dart';

part 'team_dto.g.dart';

@JsonSerializable()
class TeamDto {
  const TeamDto({
    required this.members,
    required this.seats,
    required this.used,
    required this.plan,
  });

  factory TeamDto.fromJson(Map<String, Object?> json) =>
      _$TeamDtoFromJson(json);

  final List<AssistantMemberDto> members;
  final int seats;
  final int used;
  final TeamDtoPlan plan;

  Map<String, Object?> toJson() => _$TeamDtoToJson(this);
}
