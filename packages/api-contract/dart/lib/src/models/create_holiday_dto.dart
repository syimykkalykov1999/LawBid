// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_holiday_dto.g.dart';

@JsonSerializable()
class CreateHolidayDto {
  const CreateHolidayDto({
    required this.jurisdiction,
    required this.date,
    required this.names,
  });

  factory CreateHolidayDto.fromJson(Map<String, Object?> json) =>
      _$CreateHolidayDtoFromJson(json);

  final String jurisdiction;
  final String date;
  final Map<String, String> names;

  Map<String, Object?> toJson() => _$CreateHolidayDtoToJson(this);
}
