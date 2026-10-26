// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_demo_invite_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDemoInviteDto _$AdminDemoInviteDtoFromJson(Map<String, dynamic> json) =>
    AdminDemoInviteDto(
      inviteCode: json['inviteCode'] as String,
      inviteExpiresAt: DateTime.parse(json['inviteExpiresAt'] as String),
    );

Map<String, dynamic> _$AdminDemoInviteDtoToJson(AdminDemoInviteDto instance) =>
    <String, dynamic>{
      'inviteCode': instance.inviteCode,
      'inviteExpiresAt': instance.inviteExpiresAt.toIso8601String(),
    };
