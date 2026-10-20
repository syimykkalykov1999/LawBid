// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'timezone_dto.g.dart';

@JsonSerializable()
class TimezoneDto {
  const TimezoneDto({required this.timezone});

  factory TimezoneDto.fromJson(Map<String, Object?> json) =>
      _$TimezoneDtoFromJson(json);

  final String timezone;

  Map<String, Object?> toJson() => _$TimezoneDtoToJson(this);
}
