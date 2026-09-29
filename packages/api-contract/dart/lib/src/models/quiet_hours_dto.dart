// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'quiet_hours_dto.g.dart';

@JsonSerializable()
class QuietHoursDto {
  const QuietHoursDto({this.start, this.end, this.timezone});

  factory QuietHoursDto.fromJson(Map<String, Object?> json) =>
      _$QuietHoursDtoFromJson(json);

  /// null clears the quiet hours.
  final String? start;
  final String? end;
  final String? timezone;

  Map<String, Object?> toJson() => _$QuietHoursDtoToJson(this);
}
