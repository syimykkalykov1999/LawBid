// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_support_desk_settings_dto.g.dart';

@JsonSerializable()
class UpdateSupportDeskSettingsDto {
  const UpdateSupportDeskSettingsDto({
    this.autoAssign,
    this.slaFirstResponseMinutes,
    this.slaUrgentMinutes,
    this.slaAlerts,
    this.escalateOnBreach,
    this.alwaysOpen,
    this.openDays,
    this.openFromHour,
    this.openToHour,
    this.timeZone,
    this.autoReply,
    this.autoCloseResolvedDays,
  });

  factory UpdateSupportDeskSettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdateSupportDeskSettingsDtoFromJson(json);

  final bool? autoAssign;
  final num? slaFirstResponseMinutes;
  final num? slaUrgentMinutes;
  final bool? slaAlerts;
  final bool? escalateOnBreach;
  final bool? alwaysOpen;
  final List<num>? openDays;
  final num? openFromHour;
  final num? openToHour;
  final String? timeZone;
  final bool? autoReply;
  final num? autoCloseResolvedDays;

  Map<String, Object?> toJson() => _$UpdateSupportDeskSettingsDtoToJson(this);
}
