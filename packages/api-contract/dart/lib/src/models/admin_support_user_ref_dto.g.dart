// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_support_user_ref_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSupportUserRefDto _$AdminSupportUserRefDtoFromJson(
  Map<String, dynamic> json,
) => AdminSupportUserRefDto(
  id: json['id'] as String,
  name: json['name'] as String,
  role: json['role'] as String?,
);

Map<String, dynamic> _$AdminSupportUserRefDtoToJson(
  AdminSupportUserRefDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': instance.name,
  'role': ?instance.role,
};
