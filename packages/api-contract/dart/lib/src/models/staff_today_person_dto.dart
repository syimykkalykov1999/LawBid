// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_today_person_dto_workspace.dart';

part 'staff_today_person_dto.g.dart';

@JsonSerializable()
class StaffTodayPersonDto {
  const StaffTodayPersonDto({
    required this.adminId,
    required this.name,
    required this.workspace,
    required this.rating,
    required this.status,
    required this.flags,
    required this.decisions,
  });

  factory StaffTodayPersonDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayPersonDtoFromJson(json);

  final String adminId;
  final String name;
  final StaffTodayPersonDtoWorkspace workspace;
  final num? rating;
  final String status;
  final List<String> flags;
  final int decisions;

  Map<String, Object?> toJson() => _$StaffTodayPersonDtoToJson(this);
}
