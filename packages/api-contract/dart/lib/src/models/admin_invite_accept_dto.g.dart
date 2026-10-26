// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_invite_accept_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminInviteAcceptDto _$AdminInviteAcceptDtoFromJson(
  Map<String, dynamic> json,
) => AdminInviteAcceptDto(
  token: json['token'] as String,
  login: json['login'] as String,
  password: json['password'] as String,
);

Map<String, dynamic> _$AdminInviteAcceptDtoToJson(
  AdminInviteAcceptDto instance,
) => <String, dynamic>{
  'token': instance.token,
  'login': instance.login,
  'password': instance.password,
};
