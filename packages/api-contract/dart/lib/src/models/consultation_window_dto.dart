// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'consultation_window_dto.g.dart';

@JsonSerializable()
class ConsultationWindowDto {
  const ConsultationWindowDto({
    required this.weekday,
    required this.startMinute,
    required this.endMinute,
  });

  factory ConsultationWindowDto.fromJson(Map<String, Object?> json) =>
      _$ConsultationWindowDtoFromJson(json);

  /// ISO weekday: 1 = Monday … 7 = Sunday
  final int weekday;

  /// Minutes from midnight in the attorney time zone
  final int startMinute;
  final int endMinute;

  Map<String, Object?> toJson() => _$ConsultationWindowDtoToJson(this);
}
