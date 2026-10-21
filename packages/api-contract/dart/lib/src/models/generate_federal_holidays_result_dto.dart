// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'generate_federal_holidays_result_dto.g.dart';

@JsonSerializable()
class GenerateFederalHolidaysResultDto {
  const GenerateFederalHolidaysResultDto({
    required this.created,
    required this.existing,
  });

  factory GenerateFederalHolidaysResultDto.fromJson(
    Map<String, Object?> json,
  ) => _$GenerateFederalHolidaysResultDtoFromJson(json);

  final int created;
  final int existing;

  Map<String, Object?> toJson() =>
      _$GenerateFederalHolidaysResultDtoToJson(this);
}
