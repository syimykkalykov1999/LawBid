// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'consultation_time_off_dto.g.dart';

@JsonSerializable()
class ConsultationTimeOffDto {
  const ConsultationTimeOffDto({
    required this.startsOn,
    required this.endsOn,
    this.note,
  });

  factory ConsultationTimeOffDto.fromJson(Map<String, Object?> json) =>
      _$ConsultationTimeOffDtoFromJson(json);

  final String startsOn;
  final String endsOn;
  final String? note;

  Map<String, Object?> toJson() => _$ConsultationTimeOffDtoToJson(this);
}
