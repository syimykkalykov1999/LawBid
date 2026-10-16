// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_invite_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminInviteResultDto _$AdminInviteResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminInviteResultDto(
  admin: AdminAccountDto.fromJson(json['admin'] as Map<String, dynamic>),
  invite: AdminInviteDto.fromJson(json['invite'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminInviteResultDtoToJson(
  AdminInviteResultDto instance,
) => <String, dynamic>{
  'admin': instance.admin.toJson(),
  'invite': instance.invite.toJson(),
};
