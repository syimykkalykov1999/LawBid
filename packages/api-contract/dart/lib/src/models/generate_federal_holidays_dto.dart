// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'generate_federal_holidays_dto.g.dart';

@JsonSerializable()
class GenerateFederalHolidaysDto {
  const GenerateFederalHolidaysDto({required this.year});

  factory GenerateFederalHolidaysDto.fromJson(Map<String, Object?> json) =>
      _$GenerateFederalHolidaysDtoFromJson(json);

  final num year;

  Map<String, Object?> toJson() => _$GenerateFederalHolidaysDtoToJson(this);
}
