// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consultation_time_off_dto.dart';
import 'consultation_window_dto.dart';

part 'update_consultation_settings_dto.g.dart';

@JsonSerializable()
class UpdateConsultationSettingsDto {
  const UpdateConsultationSettingsDto({
    required this.enabled,
    required this.slotMinutes,
    required this.bufferMinutes,
    required this.minNoticeHours,
    required this.horizonDays,
    required this.autoConfirm,
    required this.timezone,
    required this.windows,
    required this.timeOff,
  });
  
  factory UpdateConsultationSettingsDto.fromJson(Map<String, Object?> json) => _$UpdateConsultationSettingsDtoFromJson(json);
  
  final bool enabled;
  final int slotMinutes;
  final int bufferMinutes;
  final int minNoticeHours;
  final int horizonDays;
  final bool autoConfirm;
  final String timezone;
  final List<ConsultationWindowDto> windows;
  final List<ConsultationTimeOffDto> timeOff;

  Map<String, Object?> toJson() => _$UpdateConsultationSettingsDtoToJson(this);
}
