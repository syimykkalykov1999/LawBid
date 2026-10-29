// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reschedule_consultation_dto.g.dart';

@JsonSerializable()
class RescheduleConsultationDto {
  const RescheduleConsultationDto({
    required this.startsAt,
  });
  
  factory RescheduleConsultationDto.fromJson(Map<String, Object?> json) => _$RescheduleConsultationDtoFromJson(json);
  
  final String startsAt;

  Map<String, Object?> toJson() => _$RescheduleConsultationDtoToJson(this);
}
