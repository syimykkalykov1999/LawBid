// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_holiday_dto.g.dart';

@JsonSerializable()
class AdminHolidayDto {
  const AdminHolidayDto({
    required this.date,
    required this.names,
    required this.id,
    required this.jurisdiction,
  });

  factory AdminHolidayDto.fromJson(Map<String, Object?> json) =>
      _$AdminHolidayDtoFromJson(json);

  final String date;
  final Map<String, String> names;
  final String id;
  final String jurisdiction;

  Map<String, Object?> toJson() => _$AdminHolidayDtoToJson(this);
}
