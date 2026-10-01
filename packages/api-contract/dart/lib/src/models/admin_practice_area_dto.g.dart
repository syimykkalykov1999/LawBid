// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_practice_area_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPracticeAreaDto _$AdminPracticeAreaDtoFromJson(
  Map<String, dynamic> json,
) => AdminPracticeAreaDto(
  id: json['id'] as String,
  code: json['code'] as String,
  nameEn: json['nameEn'] as String,
  sort: (json['sort'] as num).toInt(),
  isActive: json['isActive'] as bool,
  attorneys: (json['attorneys'] as num).toInt(),
  cases: (json['cases'] as num).toInt(),
  posts: (json['posts'] as num).toInt(),
  parentCode: json['parentCode'] as String?,
);

Map<String, dynamic> _$AdminPracticeAreaDtoToJson(
  AdminPracticeAreaDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'code': instance.code,
  'nameEn': instance.nameEn,
  'parentCode': ?instance.parentCode,
  'sort': instance.sort,
  'isActive': instance.isActive,
  'attorneys': instance.attorneys,
  'cases': instance.cases,
  'posts': instance.posts,
};
