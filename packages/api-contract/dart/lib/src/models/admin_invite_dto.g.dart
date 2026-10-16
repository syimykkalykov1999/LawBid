// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_invite_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminInviteDto _$AdminInviteDtoFromJson(Map<String, dynamic> json) =>
    AdminInviteDto(
      token: json['token'] as String,
      url: json['url'] as String?,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$AdminInviteDtoToJson(AdminInviteDto instance) =>
    <String, dynamic>{
      'token': instance.token,
      'url': ?instance.url,
      'expiresAt': instance.expiresAt.toIso8601String(),
    };
