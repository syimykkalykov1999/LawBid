// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_practice_area_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CasePracticeAreaDto _$CasePracticeAreaDtoFromJson(Map<String, dynamic> json) =>
    CasePracticeAreaDto(
      id: json['id'] as String,
      code: json['code'] as String,
      i18nKey: json['i18nKey'] as String,
      nameEn: json['nameEn'] as String,
      categoryId: json['categoryId'] as String,
      categoryCode: json['categoryCode'] as String,
      categoryI18nKey: json['categoryI18nKey'] as String,
      categoryNameEn: json['categoryNameEn'] as String,
    );

Map<String, dynamic> _$CasePracticeAreaDtoToJson(
  CasePracticeAreaDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'code': instance.code,
  'i18nKey': instance.i18nKey,
  'nameEn': instance.nameEn,
  'categoryId': instance.categoryId,
  'categoryCode': instance.categoryCode,
  'categoryI18nKey': instance.categoryI18nKey,
  'categoryNameEn': instance.categoryNameEn,
};
