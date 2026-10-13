// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_password_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetPasswordDto _$SetPasswordDtoFromJson(Map<String, dynamic> json) =>
    SetPasswordDto(
      password: json['password'] as String,
      currentPassword: json['currentPassword'] as String?,
    );

Map<String, dynamic> _$SetPasswordDtoToJson(SetPasswordDto instance) =>
    <String, dynamic>{
      'password': instance.password,
      'currentPassword': ?instance.currentPassword,
    };
