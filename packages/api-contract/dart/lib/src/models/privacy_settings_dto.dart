// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'privacy_audience.dart';

part 'privacy_settings_dto.g.dart';

@JsonSerializable()
class PrivacySettingsDto {
  const PrivacySettingsDto({
    required this.lastSeen,
    required this.messageFrom,
    required this.callFrom,
  });

  factory PrivacySettingsDto.fromJson(Map<String, Object?> json) =>
      _$PrivacySettingsDtoFromJson(json);

  final PrivacyAudience lastSeen;
  final PrivacyAudience messageFrom;
  final PrivacyAudience callFrom;

  Map<String, Object?> toJson() => _$PrivacySettingsDtoToJson(this);
}
