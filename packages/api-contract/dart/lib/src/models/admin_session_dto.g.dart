// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_session_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSessionDto _$AdminSessionDtoFromJson(Map<String, dynamic> json) =>
    AdminSessionDto(
      accessToken: json['accessToken'] as String,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      admin: AdminMeDto.fromJson(json['admin'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminSessionDtoToJson(AdminSessionDto instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'expiresAt': instance.expiresAt.toIso8601String(),
      'admin': instance.admin.toJson(),
    };
