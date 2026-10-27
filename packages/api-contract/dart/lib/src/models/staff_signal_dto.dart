// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_person_ref_dto.dart';

part 'staff_signal_dto.g.dart';

@JsonSerializable()
class StaffSignalDto {
  const StaffSignalDto({
    required this.id,
    required this.code,
    required this.subject,
    required this.actor,
    required this.details,
    required this.createdAt,
  });

  factory StaffSignalDto.fromJson(Map<String, Object?> json) =>
      _$StaffSignalDtoFromJson(json);

  final String id;

  /// team_turnover_high · top_rated_removed · removal_without_warning · head_multi_appeals · retaliation_decide · appeal_unanswered
  final String code;
  final StaffPersonRefDto subject;
  final StaffPersonRefDto? actor;
  final dynamic details;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$StaffSignalDtoToJson(this);
}
