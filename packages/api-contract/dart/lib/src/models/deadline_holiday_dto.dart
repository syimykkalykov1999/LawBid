// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'deadline_holiday_dto.g.dart';

@JsonSerializable()
class DeadlineHolidayDto {
  const DeadlineHolidayDto({required this.date, required this.names});

  factory DeadlineHolidayDto.fromJson(Map<String, Object?> json) =>
      _$DeadlineHolidayDtoFromJson(json);

  final String date;
  final Map<String, String> names;

  Map<String, Object?> toJson() => _$DeadlineHolidayDtoToJson(this);
}
