// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'support_desk_settings_dto.g.dart';

@JsonSerializable()
class SupportDeskSettingsDto {
  const SupportDeskSettingsDto({
    required this.autoAssign,
    required this.slaFirstResponseMinutes,
    required this.slaUrgentMinutes,
    required this.slaAlerts,
    required this.escalateOnBreach,
    required this.alwaysOpen,
    required this.openDays,
    required this.openFromHour,
    required this.openToHour,
    required this.timeZone,
    required this.autoReply,
    required this.autoCloseResolvedDays,
  });

  factory SupportDeskSettingsDto.fromJson(Map<String, Object?> json) =>
      _$SupportDeskSettingsDtoFromJson(json);

  /// New tickets go to agents on shift by themselves.
  final bool autoAssign;
  final num slaFirstResponseMinutes;

  /// High and urgent tickets.
  final num slaUrgentMinutes;

  /// Tell the team (e-mail) when an answer is late.
  final bool slaAlerts;

  /// A late ticket goes one priority up.
  final bool escalateOnBreach;

  /// 24/7; off = the hours below.
  final bool alwaysOpen;

  /// 1 = Monday … 7 = Sunday.
  final List<num> openDays;
  final num openFromHour;
  final num openToHour;
  final String timeZone;

  /// Answer automatically outside the hours.
  final bool autoReply;

  /// Resolved → closed after N days (0 = never).
  final num autoCloseResolvedDays;

  Map<String, Object?> toJson() => _$SupportDeskSettingsDtoToJson(this);
}
