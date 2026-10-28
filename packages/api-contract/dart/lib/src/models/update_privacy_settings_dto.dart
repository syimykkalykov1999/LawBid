// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'privacy_audience.dart';
import 'privacy_audience_option.dart';

part 'update_privacy_settings_dto.g.dart';

@JsonSerializable()
class UpdatePrivacySettingsDto {
  const UpdatePrivacySettingsDto({
    this.lastSeen,
    this.messageFrom,
    this.callFrom,
    this.photoFrom,
    this.aboutFrom,
    this.groupAddFrom,
    this.lastSeenAudiences,
    this.messageFromAudiences,
    this.callFromAudiences,
    this.photoFromAudiences,
    this.aboutFromAudiences,
    this.groupAddFromAudiences,
    this.doNotSell,
  });

  factory UpdatePrivacySettingsDto.fromJson(Map<String, Object?> json) =>
      _$UpdatePrivacySettingsDtoFromJson(json);

  final PrivacyAudience? lastSeen;
  final PrivacyAudience? messageFrom;
  final PrivacyAudience? callFrom;
  final PrivacyAudience? photoFrom;
  final PrivacyAudience? aboutFrom;
  final PrivacyAudience? groupAddFrom;

  /// Owner 2026-10-28: who exactly — ["everyone"], ["nobody"] or any of contacts (phone book) / followers (people who follow me) / following (people I follow). Wins over the single old value.
  final List<PrivacyAudienceOption>? lastSeenAudiences;

  /// Owner 2026-10-28: who exactly — ["everyone"], ["nobody"] or any of contacts (phone book) / followers (people who follow me) / following (people I follow). Wins over the single old value.
  final List<PrivacyAudienceOption>? messageFromAudiences;

  /// Owner 2026-10-28: who exactly — ["everyone"], ["nobody"] or any of contacts (phone book) / followers (people who follow me) / following (people I follow). Wins over the single old value.
  final List<PrivacyAudienceOption>? callFromAudiences;

  /// Owner 2026-10-28: who exactly — ["everyone"], ["nobody"] or any of contacts (phone book) / followers (people who follow me) / following (people I follow). Wins over the single old value.
  final List<PrivacyAudienceOption>? photoFromAudiences;

  /// Owner 2026-10-28: who exactly — ["everyone"], ["nobody"] or any of contacts (phone book) / followers (people who follow me) / following (people I follow). Wins over the single old value.
  final List<PrivacyAudienceOption>? aboutFromAudiences;

  /// Owner 2026-10-28: who exactly — ["everyone"], ["nobody"] or any of contacts (phone book) / followers (people who follow me) / following (people I follow). Wins over the single old value.
  final List<PrivacyAudienceOption>? groupAddFromAudiences;

  /// CCPA/CPRA «Do not sell or share my personal information»: true = opt out, false = allow again.
  final bool? doNotSell;

  Map<String, Object?> toJson() => _$UpdatePrivacySettingsDtoToJson(this);
}
