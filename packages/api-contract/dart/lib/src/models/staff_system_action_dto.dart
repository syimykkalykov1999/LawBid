// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_system_action_dto_kind.dart';

part 'staff_system_action_dto.g.dart';

@JsonSerializable()
class StaffSystemActionDto {
  const StaffSystemActionDto({
    required this.kind,
    required this.target,
    required this.label,
  });

  factory StaffSystemActionDto.fromJson(Map<String, Object?> json) =>
      _$StaffSystemActionDtoFromJson(json);

  /// route = admin page, guide = «Инструкции» id, launch = «Запуск» step id (its guide), url = outside link.
  final StaffSystemActionDtoKind kind;
  final String target;

  /// The button text.
  final String label;

  Map<String, Object?> toJson() => _$StaffSystemActionDtoToJson(this);
}
