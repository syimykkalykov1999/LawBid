// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAdminDto _$StaffAdminDtoFromJson(Map<String, dynamic> json) =>
    StaffAdminDto(
      id: json['id'] as String,
      name: json['name'] as String?,
      email: json['email'] as String?,
      role: json['role'] as String?,
    );

Map<String, dynamic> _$StaffAdminDtoToJson(StaffAdminDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'name': ?instance.name,
      'email': ?instance.email,
      'role': ?instance.role,
    };
