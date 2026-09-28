// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'practice_area_ref_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PracticeAreaRefDto _$PracticeAreaRefDtoFromJson(Map<String, dynamic> json) =>
    PracticeAreaRefDto(
      id: json['id'] as String,
      code: json['code'] as String,
      nameEn: json['nameEn'] as String,
      i18nKey: json['i18nKey'] as String,
    );

Map<String, dynamic> _$PracticeAreaRefDtoToJson(PracticeAreaRefDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'code': instance.code,
      'nameEn': instance.nameEn,
      'i18nKey': instance.i18nKey,
    };
