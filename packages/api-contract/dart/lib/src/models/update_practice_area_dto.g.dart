// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_practice_area_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdatePracticeAreaDto _$UpdatePracticeAreaDtoFromJson(
  Map<String, dynamic> json,
) => UpdatePracticeAreaDto(
  nameEn: json['nameEn'] as String?,
  isActive: json['isActive'] as bool?,
  sort: (json['sort'] as num?)?.toInt(),
);

Map<String, dynamic> _$UpdatePracticeAreaDtoToJson(
  UpdatePracticeAreaDto instance,
) => <String, dynamic>{
  'nameEn': ?instance.nameEn,
  'isActive': ?instance.isActive,
  'sort': ?instance.sort,
};
