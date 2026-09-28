// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'practice_area_category_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PracticeAreaCategoryDto _$PracticeAreaCategoryDtoFromJson(
  Map<String, dynamic> json,
) => PracticeAreaCategoryDto(
  id: json['id'] as String,
  code: json['code'] as String,
  i18nKey: json['i18nKey'] as String,
  nameEn: json['nameEn'] as String,
  children: (json['children'] as List<dynamic>)
      .map((e) => PracticeAreaLeafDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$PracticeAreaCategoryDtoToJson(
  PracticeAreaCategoryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'code': instance.code,
  'i18nKey': instance.i18nKey,
  'nameEn': instance.nameEn,
  'children': instance.children.map((e) => e.toJson()).toList(),
};
