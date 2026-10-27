// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_decide_appeal_dto_decision.dart';

part 'staff_decide_appeal_dto.g.dart';

@JsonSerializable()
class StaffDecideAppealDto {
  const StaffDecideAppealDto({required this.decision, this.note});

  factory StaffDecideAppealDto.fromJson(Map<String, Object?> json) =>
      _$StaffDecideAppealDtoFromJson(json);

  final StaffDecideAppealDtoDecision decision;
  final String? note;

  Map<String, Object?> toJson() => _$StaffDecideAppealDtoToJson(this);
}
