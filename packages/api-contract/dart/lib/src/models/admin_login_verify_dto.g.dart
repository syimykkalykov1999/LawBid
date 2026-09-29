// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_login_verify_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLoginVerifyDto _$AdminLoginVerifyDtoFromJson(Map<String, dynamic> json) =>
    AdminLoginVerifyDto(
      email: json['email'] as String,
      code: json['code'] as String,
    );

Map<String, dynamic> _$AdminLoginVerifyDtoToJson(
  AdminLoginVerifyDto instance,
) => <String, dynamic>{'email': instance.email, 'code': instance.code};
