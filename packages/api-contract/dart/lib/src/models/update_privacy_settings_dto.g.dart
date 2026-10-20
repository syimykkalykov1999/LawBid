// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_privacy_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdatePrivacySettingsDto _$UpdatePrivacySettingsDtoFromJson(
  Map<String, dynamic> json,
) => UpdatePrivacySettingsDto(
  lastSeen: json['lastSeen'] == null
      ? null
      : PrivacyAudience.fromJson(json['lastSeen'] as String),
  messageFrom: json['messageFrom'] == null
      ? null
      : PrivacyAudience.fromJson(json['messageFrom'] as String),
  callFrom: json['callFrom'] == null
      ? null
      : PrivacyAudience.fromJson(json['callFrom'] as String),
);

Map<String, dynamic> _$UpdatePrivacySettingsDtoToJson(
  UpdatePrivacySettingsDto instance,
) => <String, dynamic>{
  'lastSeen': ?instance.lastSeen?.toJson(),
  'messageFrom': ?instance.messageFrom?.toJson(),
  'callFrom': ?instance.callFrom?.toJson(),
};
