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
  photoFrom: json['photoFrom'] == null
      ? null
      : PrivacyAudience.fromJson(json['photoFrom'] as String),
  aboutFrom: json['aboutFrom'] == null
      ? null
      : PrivacyAudience.fromJson(json['aboutFrom'] as String),
  groupAddFrom: json['groupAddFrom'] == null
      ? null
      : PrivacyAudience.fromJson(json['groupAddFrom'] as String),
  doNotSell: json['doNotSell'] as bool?,
);

Map<String, dynamic> _$UpdatePrivacySettingsDtoToJson(
  UpdatePrivacySettingsDto instance,
) => <String, dynamic>{
  'lastSeen': ?instance.lastSeen?.toJson(),
  'messageFrom': ?instance.messageFrom?.toJson(),
  'callFrom': ?instance.callFrom?.toJson(),
  'photoFrom': ?instance.photoFrom?.toJson(),
  'aboutFrom': ?instance.aboutFrom?.toJson(),
  'groupAddFrom': ?instance.groupAddFrom?.toJson(),
  'doNotSell': ?instance.doNotSell,
};
