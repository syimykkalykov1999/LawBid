// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'day_usd_dto.g.dart';

@JsonSerializable()
class DayUsdDto {
  const DayUsdDto({required this.date, required this.usd});

  factory DayUsdDto.fromJson(Map<String, Object?> json) =>
      _$DayUsdDtoFromJson(json);

  final String date;
  final num usd;

  Map<String, Object?> toJson() => _$DayUsdDtoToJson(this);
}
