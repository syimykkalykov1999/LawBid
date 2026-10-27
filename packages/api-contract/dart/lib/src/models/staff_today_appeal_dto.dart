// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_today_appeal_dto_status.dart';

part 'staff_today_appeal_dto.g.dart';

@JsonSerializable()
class StaffTodayAppealDto {
  const StaffTodayAppealDto({
    required this.id,
    required this.number,
    required this.kind,
    required this.status,
    required this.headName,
    required this.createdAt,
  });

  factory StaffTodayAppealDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayAppealDtoFromJson(json);

  final String id;

  /// Appeal number («№N»).
  final num number;
  final String kind;
  final StaffTodayAppealDtoStatus status;

  /// The head the complaint is about.
  final String headName;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$StaffTodayAppealDtoToJson(this);
}
