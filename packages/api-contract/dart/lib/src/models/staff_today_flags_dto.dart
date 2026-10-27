// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_today_flags_dto.g.dart';

@JsonSerializable()
class StaffTodayFlagsDto {
  const StaffTodayFlagsDto({required this.open});

  factory StaffTodayFlagsDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayFlagsDtoFromJson(json);

  /// Open red marks.
  final int open;

  Map<String, Object?> toJson() => _$StaffTodayFlagsDtoToJson(this);
}
