// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'support_client_context_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SupportClientContextDto _$SupportClientContextDtoFromJson(
  Map<String, dynamic> json,
) => SupportClientContextDto(
  appVersion: json['appVersion'] as String?,
  buildNumber: json['buildNumber'] as String?,
  platform: json['platform'] == null
      ? null
      : SupportClientContextDtoPlatform.fromJson(json['platform'] as String),
  osVersion: json['osVersion'] as String?,
  deviceModel: json['deviceModel'] as String?,
  language: json['language'] as String?,
  theme: json['theme'] as String?,
  timezone: json['timezone'] as String?,
  route: json['route'] as String?,
  userId: json['userId'] as String?,
  role: json['role'] as String?,
);

Map<String, dynamic> _$SupportClientContextDtoToJson(
  SupportClientContextDto instance,
) => <String, dynamic>{
  'appVersion': ?instance.appVersion,
  'buildNumber': ?instance.buildNumber,
  'platform': ?instance.platform?.toJson(),
  'osVersion': ?instance.osVersion,
  'deviceModel': ?instance.deviceModel,
  'language': ?instance.language,
  'theme': ?instance.theme,
  'timezone': ?instance.timezone,
  'route': ?instance.route,
  'userId': ?instance.userId,
  'role': ?instance.role,
};
