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
  });

  factory OutreachSettingsDto.fromJson(Map<String, Object?> json) =>
      _$OutreachSettingsDtoFromJson(json);

  final num dailyEmailLimit;
  final String fromName;

  /// CAN-SPAM postal address printed in every cold email.
  final String footerAddress;

  /// Public https base of the API for unsubscribe links, e.g. https://api.lawbid.dev.
  final String apiPublicUrl;

  Map<String, Object?> toJson() => _$OutreachSettingsDtoToJson(this);
}
