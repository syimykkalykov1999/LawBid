// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'post_practice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PostPracticeDto _$PostPracticeDtoFromJson(Map<String, dynamic> json) =>
    PostPracticeDto(
      code: json['code'] as String,
      categoryCode: json['categoryCode'] as String,
      nameEn: json['nameEn'] as String,
      i18nKey: json['i18nKey'] as String,
    );

Map<String, dynamic> _$PostPracticeDtoToJson(PostPracticeDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'categoryCode': instance.categoryCode,
      'nameEn': instance.nameEn,
      'i18nKey': instance.i18nKey,
    };
