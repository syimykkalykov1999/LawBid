// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_today_appeal_dto.dart';

part 'staff_today_appeals_dto.g.dart';

@JsonSerializable()
class StaffTodayAppealsDto {
  const StaffTodayAppealsDto({required this.open, required this.newest});

  factory StaffTodayAppealsDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayAppealsDtoFromJson(json);

  /// New or seen, not decided.
  final int open;

  /// The 3 newest.
  final List<StaffTodayAppealDto> newest;

  Map<String, Object?> toJson() => _$StaffTodayAppealsDtoToJson(this);
}
