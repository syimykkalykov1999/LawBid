// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_change_own_credentials_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminChangeOwnCredentialsDto _$AdminChangeOwnCredentialsDtoFromJson(
  Map<String, dynamic> json,
) => AdminChangeOwnCredentialsDto(
  currentPassword: json['currentPassword'] as String?,
  newLogin: json['newLogin'] as String?,
  newPassword: json['newPassword'] as String?,
);

Map<String, dynamic> _$AdminChangeOwnCredentialsDtoToJson(
  AdminChangeOwnCredentialsDto instance,
) => <String, dynamic>{
  'currentPassword': ?instance.currentPassword,
  'newLogin': ?instance.newLogin,
  'newPassword': ?instance.newPassword,
};
