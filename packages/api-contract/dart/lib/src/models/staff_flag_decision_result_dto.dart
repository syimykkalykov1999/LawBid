// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_flag_decision_result_dto_state.dart';

part 'staff_flag_decision_result_dto.g.dart';

@JsonSerializable()
class StaffFlagDecisionResultDto {
  const StaffFlagDecisionResultDto({
    required this.id,
    required this.state,
    required this.reinstated,
  });

  factory StaffFlagDecisionResultDto.fromJson(Map<String, Object?> json) =>
      _$StaffFlagDecisionResultDtoFromJson(json);

  final String id;
  final StaffFlagDecisionResultDtoState state;

  /// The person works again (reverse) or not.
  final bool reinstated;

  Map<String, Object?> toJson() => _$StaffFlagDecisionResultDtoToJson(this);
}
