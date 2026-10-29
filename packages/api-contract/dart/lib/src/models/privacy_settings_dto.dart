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
    required this.photoFrom,
    required this.aboutFrom,
    required this.groupAddFrom,
    this.doNotSell,
  });
  
  factory PrivacySettingsDto.fromJson(Map<String, Object?> json) => _$PrivacySettingsDtoFromJson(json);
  
  final PrivacyAudience lastSeen;
  final PrivacyAudience messageFrom;
  final PrivacyAudience callFrom;
  final PrivacyAudience photoFrom;
  final PrivacyAudience aboutFrom;
  final PrivacyAudience groupAddFrom;

  /// Owner 2026-10-22 (CCPA/CPRA): «Do not sell or share my personal information» — true = opted out. Stored as a do_not_sell consent (in the data export), honoured by the analytics gate.
  final bool? doNotSell;

  Map<String, Object?> toJson() => _$PrivacySettingsDtoToJson(this);
}
