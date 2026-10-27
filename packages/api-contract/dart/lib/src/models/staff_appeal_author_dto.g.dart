// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_appeal_author_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAppealAuthorDto _$StaffAppealAuthorDtoFromJson(
  Map<String, dynamic> json,
) => StaffAppealAuthorDto(
  adminId: json['adminId'] as String?,
  label: json['label'] as String,
  anonymous: json['anonymous'] as bool,
);

Map<String, dynamic> _$StaffAppealAuthorDtoToJson(
  StaffAppealAuthorDto instance,
) => <String, dynamic>{
  'adminId': ?instance.adminId,
  'label': instance.label,
  'anonymous': instance.anonymous,
};
