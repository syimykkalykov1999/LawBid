// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_recover_password_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRecoverPasswordDto _$AdminRecoverPasswordDtoFromJson(
  Map<String, dynamic> json,
) => AdminRecoverPasswordDto(
  login: json['login'] as String,
  answer: json['answer'] as String,
  newPassword: json['newPassword'] as String,
);

Map<String, dynamic> _$AdminRecoverPasswordDtoToJson(
  AdminRecoverPasswordDto instance,
) => <String, dynamic>{
  'login': instance.login,
  'answer': instance.answer,
  'newPassword': instance.newPassword,
};
