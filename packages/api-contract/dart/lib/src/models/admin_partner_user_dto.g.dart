// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerUserDto _$AdminPartnerUserDtoFromJson(Map<String, dynamic> json) =>
    AdminPartnerUserDto(
      id: json['id'] as String,
      name: json['name'] as String?,
      email: json['email'] as String?,
      role: json['role'] as String?,
    );

Map<String, dynamic> _$AdminPartnerUserDtoToJson(
  AdminPartnerUserDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': ?instance.name,
  'email': ?instance.email,
  'role': ?instance.role,
};
