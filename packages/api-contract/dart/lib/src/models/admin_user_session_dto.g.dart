// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_session_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserSessionDto _$AdminUserSessionDtoFromJson(Map<String, dynamic> json) =>
    AdminUserSessionDto(
      sessionChainId: json['sessionChainId'] as String,
      deviceName: json['deviceName'] as String?,
      platform: json['platform'] as String?,
      appVersion: json['appVersion'] as String?,
      ip: json['ip'] as String?,
      lastUsedAt: json['lastUsedAt'] == null
          ? null
          : DateTime.parse(json['lastUsedAt'] as String),
      createdAt: DateTime.parse(json['createdAt'] as String),
      pushTokens: (json['pushTokens'] as num).toInt(),
    );

Map<String, dynamic> _$AdminUserSessionDtoToJson(
  AdminUserSessionDto instance,
) => <String, dynamic>{
  'sessionChainId': instance.sessionChainId,
  'deviceName': ?instance.deviceName,
  'platform': ?instance.platform,
  'appVersion': ?instance.appVersion,
  'ip': ?instance.ip,
  'lastUsedAt': ?instance.lastUsedAt?.toIso8601String(),
  'createdAt': instance.createdAt.toIso8601String(),
  'pushTokens': instance.pushTokens,
};
