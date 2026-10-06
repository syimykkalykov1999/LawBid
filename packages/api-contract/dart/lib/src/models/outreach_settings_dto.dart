// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'outreach_settings_dto.g.dart';

@JsonSerializable()
class OutreachSettingsDto {
  const OutreachSettingsDto({
    required this.dailyEmailLimit,
    required this.fromName,
    required this.footerAddress,
    required this.apiPublicUrl,
    this.clientLeadsEnabled,
    this.dncConfirmed,
    this.dncSan,
    this.callHoursStart,
    this.callHoursEnd,
    this.maxEmailsPerLead,
    this.emailCooldownDays,
    this.leadRetentionDays,
  });

  factory OutreachSettingsDto.fromJson(Map<String, Object?> json) =>
      _$OutreachSettingsDtoFromJson(json);

  final num dailyEmailLimit;
  final String fromName;

  /// CAN-SPAM postal address printed in every cold email.
  final String footerAddress;

  /// Public https base of the API for unsubscribe links, e.g. https://api.lawbid.dev.
  final String apiPublicUrl;

  /// Allow client (consumer) leads; requires dncConfirmed. Off by default.
  final bool? clientLeadsEnabled;

  /// Consumer numbers are scrubbed against the National Do-Not-Call registry.
  final bool? dncConfirmed;

  /// DNC registry Subscription Account Number (informational).
  final String? dncSan;

  /// Calls allowed from this local hour of the lead's state.
  final num? callHoursStart;

  /// Calls allowed until this local hour (exclusive); > start.
  final num? callHoursEnd;

  /// Cold emails one lead may receive in total; 0 = no cap.
  final num? maxEmailsPerLead;

  /// Days between two cold emails to the same lead.
  final num? emailCooldownDays;

  /// Unconverted leads with no activity for this long are deleted daily.
  final num? leadRetentionDays;

  Map<String, Object?> toJson() => _$OutreachSettingsDtoToJson(this);
}
