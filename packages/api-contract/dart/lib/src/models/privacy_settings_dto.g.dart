// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'privacy_settings_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PrivacySettingsDto _$PrivacySettingsDtoFromJson(Map<String, dynamic> json) =>
    PrivacySettingsDto(
      lastSeen: PrivacyAudience.fromJson(json['lastSeen'] as String),
      messageFrom: PrivacyAudience.fromJson(json['messageFrom'] as String),
      callFrom: PrivacyAudience.fromJson(json['callFrom'] as String),
      photoFrom: PrivacyAudience.fromJson(json['photoFrom'] as String),
      aboutFrom: PrivacyAudience.fromJson(json['aboutFrom'] as String),
      groupAddFrom: PrivacyAudience.fromJson(json['groupAddFrom'] as String),
    );

Map<String, dynamic> _$PrivacySettingsDtoToJson(PrivacySettingsDto instance) =>
    <String, dynamic>{
      'lastSeen': instance.lastSeen.toJson(),
      'messageFrom': instance.messageFrom.toJson(),
      'callFrom': instance.callFrom.toJson(),
      'photoFrom': instance.photoFrom.toJson(),
      'aboutFrom': instance.aboutFrom.toJson(),
      'groupAddFrom': instance.groupAddFrom.toJson(),
    };
