// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_system_action_dto.dart';
import 'staff_system_item_dto_severity.dart';

part 'staff_system_item_dto.g.dart';

@JsonSerializable()
class StaffSystemItemDto {
  const StaffSystemItemDto({
    required this.code,
    required this.severity,
    required this.title,
    required this.why,
    required this.action,
  });

  factory StaffSystemItemDto.fromJson(Map<String, Object?> json) =>
      _$StaffSystemItemDtoFromJson(json);

  /// Stable: the row disappears when done.
  final String code;
  final StaffSystemItemDtoSeverity severity;
  final String title;

  /// One line: why today.
  final String why;
  final StaffSystemActionDto action;

  Map<String, Object?> toJson() => _$StaffSystemItemDtoToJson(this);
}
