// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_session_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSessionRowDto _$AdminSessionRowDtoFromJson(Map<String, dynamic> json) =>
    AdminSessionRowDto(
      sessionId: json['sessionId'] as String,
      adminId: json['adminId'] as String,
      email: json['email'] as String,
      login: json['login'] as String?,
      role: AdminSessionRowDtoRole.fromJson(json['role'] as String),
      ip: json['ip'] as String?,
      device: json['device'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      lastSeenAt: DateTime.parse(json['lastSeenAt'] as String),
      lastAction: json['lastAction'] as String?,
      current: json['current'] as bool,
    );

Map<String, dynamic> _$AdminSessionRowDtoToJson(AdminSessionRowDto instance) =>
    <String, dynamic>{
      'sessionId': instance.sessionId,
      'adminId': instance.adminId,
      'email': instance.email,
      'login': ?instance.login,
      'role': instance.role.toJson(),
      'ip': ?instance.ip,
      'device': ?instance.device,
      'createdAt': instance.createdAt.toIso8601String(),
      'lastSeenAt': instance.lastSeenAt.toIso8601String(),
      'lastAction': ?instance.lastAction,
      'current': instance.current,
    };
