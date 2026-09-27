// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SessionDto _$SessionDtoFromJson(Map<String, dynamic> json) => SessionDto(
  sessionId: json['sessionId'] as String,
  deviceId: json['deviceId'] as String?,
  deviceName: json['deviceName'] as String?,
  platform: json['platform'] as String?,
  appVersion: json['appVersion'] as String?,
  lastUsedAt: json['lastUsedAt'] == null
      ? null
      : DateTime.parse(json['lastUsedAt'] as String),
  createdAt: DateTime.parse(json['createdAt'] as String),
  isCurrent: json['isCurrent'] as bool,
);

Map<String, dynamic> _$SessionDtoToJson(SessionDto instance) =>
    <String, dynamic>{
      'sessionId': instance.sessionId,
      'deviceId': ?instance.deviceId,
      'deviceName': ?instance.deviceName,
      'platform': ?instance.platform,
      'appVersion': ?instance.appVersion,
      'lastUsedAt': ?instance.lastUsedAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
      'isCurrent': instance.isCurrent,
    };
