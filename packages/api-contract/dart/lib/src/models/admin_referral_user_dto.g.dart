// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_user_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralUserDto _$AdminReferralUserDtoFromJson(
  Map<String, dynamic> json,
) => AdminReferralUserDto(
  id: json['id'] as String,
  name: json['name'] as String?,
  email: json['email'] as String?,
  role: json['role'] as String?,
);

Map<String, dynamic> _$AdminReferralUserDtoToJson(
  AdminReferralUserDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'name': ?instance.name,
  'email': ?instance.email,
  'role': ?instance.role,
};
