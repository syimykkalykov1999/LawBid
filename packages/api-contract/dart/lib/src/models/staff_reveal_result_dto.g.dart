// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_reveal_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffRevealResultDto _$StaffRevealResultDtoFromJson(
  Map<String, dynamic> json,
) => StaffRevealResultDto(
  adminId: json['adminId'] as String,
  name: json['name'] as String,
  revealsLeftToday: json['revealsLeftToday'] as num,
  email: json['email'] as String?,
);

Map<String, dynamic> _$StaffRevealResultDtoToJson(
  StaffRevealResultDto instance,
) => <String, dynamic>{
  'adminId': instance.adminId,
  'name': instance.name,
  'email': ?instance.email,
  'revealsLeftToday': instance.revealsLeftToday,
};
