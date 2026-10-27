// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_today_person_dto.dart';

part 'staff_today_shortlist_dto.g.dart';

@JsonSerializable()
class StaffTodayShortlistDto {
  const StaffTodayShortlistDto({
    required this.snapshotDate,
    required this.worst,
    required this.best,
  });

  factory StaffTodayShortlistDto.fromJson(Map<String, Object?> json) =>
      _$StaffTodayShortlistDtoFromJson(json);

  final String? snapshotDate;
  final List<StaffTodayPersonDto> worst;
  final List<StaffTodayPersonDto> best;

  Map<String, Object?> toJson() => _$StaffTodayShortlistDtoToJson(this);
}
