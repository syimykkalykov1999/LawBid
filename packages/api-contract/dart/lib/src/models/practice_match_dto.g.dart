// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'practice_match_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PracticeMatchDto _$PracticeMatchDtoFromJson(Map<String, dynamic> json) =>
    PracticeMatchDto(
      code: json['code'] as String,
      nameEn: json['nameEn'] as String,
      hit: json['hit'] as String?,
    );

Map<String, dynamic> _$PracticeMatchDtoToJson(PracticeMatchDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'nameEn': instance.nameEn,
      'hit': ?instance.hit,
    };
