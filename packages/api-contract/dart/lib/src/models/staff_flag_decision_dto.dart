// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_flag_decision_dto.g.dart';

@JsonSerializable()
class StaffFlagDecisionDto {
  const StaffFlagDecisionDto({this.note});

  factory StaffFlagDecisionDto.fromJson(Map<String, Object?> json) =>
      _$StaffFlagDecisionDtoFromJson(json);

  final String? note;

  Map<String, Object?> toJson() => _$StaffFlagDecisionDtoToJson(this);
}
