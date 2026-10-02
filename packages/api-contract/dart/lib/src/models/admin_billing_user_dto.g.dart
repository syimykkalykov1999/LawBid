// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_billing_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBillingUserDto _$AdminBillingUserDtoFromJson(Map<String, dynamic> json) =>
    AdminBillingUserDto(
      id: json['id'] as String,
      name: json['name'] as String?,
      username: json['username'] as String?,
      email: json['email'] as String?,
      role: json['role'] as String?,
    );

Map<String, dynamic> _$AdminBillingUserDtoToJson(
  AdminBillingUserDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': ?instance.name,
  'username': ?instance.username,
  'email': ?instance.email,
  'role': ?instance.role,
};
