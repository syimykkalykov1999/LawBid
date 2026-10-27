// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_appeal_author_dto.dart';
import 'staff_retaliation_flag_dto_state.dart';

part 'staff_retaliation_flag_dto.g.dart';

@JsonSerializable()
class StaffRetaliationFlagDto {
  const StaffRetaliationFlagDto({
    required this.id,
    required this.appealId,
    required this.appealNumber,
    required this.subject,
    required this.state,
    required this.windowUntil,
    required this.holdUntil,
    required this.holdActive,
    required this.createdAt,
    required this.decidedAt,
  });

  factory StaffRetaliationFlagDto.fromJson(Map<String, Object?> json) =>
      _$StaffRetaliationFlagDtoFromJson(json);

  final String id;
  final String appealId;
  final num appealNumber;
  final StaffAppealAuthorDto subject;
  final StaffRetaliationFlagDtoState state;
  final DateTime windowUntil;
  final DateTime? holdUntil;

  /// The 14-day hold is still running (reversible).
  final bool holdActive;
  final DateTime createdAt;
  final DateTime? decidedAt;

  Map<String, Object?> toJson() => _$StaffRetaliationFlagDtoToJson(this);
}
