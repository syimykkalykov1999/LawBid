// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consultation_settings_dto_not_bookable_reason.dart';
import 'consultation_time_off_dto.dart';
import 'consultation_window_dto.dart';

part 'consultation_settings_dto.g.dart';

@JsonSerializable()
class ConsultationSettingsDto {
  const ConsultationSettingsDto({
    required this.enabled,
    required this.slotMinutes,
    required this.bufferMinutes,
    required this.minNoticeHours,
    required this.horizonDays,
    required this.autoConfirm,
    required this.windows,
    required this.timeOff,
    required this.bookable,
    this.timezone,
    this.notBookableReason,
  });

  factory ConsultationSettingsDto.fromJson(Map<String, Object?> json) =>
      _$ConsultationSettingsDtoFromJson(json);

  final bool enabled;
  final int slotMinutes;
  final int bufferMinutes;
  final int minNoticeHours;
  final int horizonDays;

  /// true = a booking is confirmed at once
  final bool autoConfirm;
  final String? timezone;
  final List<ConsultationWindowDto> windows;
  final List<ConsultationTimeOffDto> timeOff;

  /// Clients can book now: verified, subscription active, hours set.
  final bool bookable;

  /// Why bookable is false (when enabled is true).
  final ConsultationSettingsDtoNotBookableReason? notBookableReason;

  Map<String, Object?> toJson() => _$ConsultationSettingsDtoToJson(this);
}
