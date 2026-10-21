// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qa_practice_area_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QaPracticeAreaDto _$QaPracticeAreaDtoFromJson(Map<String, dynamic> json) =>
    QaPracticeAreaDto(
      id: json['id'] as String,
      code: json['code'] as String,
      i18nKey: json['i18nKey'] as String,
      nameEn: json['nameEn'] as String,
    );

Map<String, dynamic> _$QaPracticeAreaDtoToJson(QaPracticeAreaDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'code': instance.code,
      'i18nKey': instance.i18nKey,
      'nameEn': instance.nameEn,
    };
