// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_decide_result_dto_decision.dart';
import 'staff_decide_result_dto_status.dart';
import 'staff_follow_up_dto.dart';

part 'staff_decide_result_dto.g.dart';

@JsonSerializable()
class StaffDecideResultDto {
  const StaffDecideResultDto({
    required this.id,
    required this.status,
    required this.decision,
    required this.decidedAt,
    required this.followUp,
  });

  factory StaffDecideResultDto.fromJson(Map<String, Object?> json) =>
      _$StaffDecideResultDtoFromJson(json);

  final String id;
  final StaffDecideResultDtoStatus status;
  final StaffDecideResultDtoDecision decision;
  final DateTime decidedAt;
  final StaffFollowUpDto? followUp;

  Map<String, Object?> toJson() => _$StaffDecideResultDtoToJson(this);
}
