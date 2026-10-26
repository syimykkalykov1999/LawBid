// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_admin_credentials_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetAdminCredentialsDto _$SetAdminCredentialsDtoFromJson(
  Map<String, dynamic> json,
) => SetAdminCredentialsDto(
  login: json['login'] as String?,
  password: json['password'] as String?,
);

Map<String, dynamic> _$SetAdminCredentialsDtoToJson(
  SetAdminCredentialsDto instance,
) => <String, dynamic>{
  'login': ?instance.login,
  'password': ?instance.password,
};
