// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_templates_filter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTemplatesFilterDto _$AdminTemplatesFilterDtoFromJson(
  Map<String, dynamic> json,
) => AdminTemplatesFilterDto(
  q: json['q'] as String?,
  practiceAreaId: json['practiceAreaId'] as String?,
  state: json['state'] as String?,
  language: json['language'] as String?,
  published: json['published'] as bool?,
);

Map<String, dynamic> _$AdminTemplatesFilterDtoToJson(
  AdminTemplatesFilterDto instance,
) => <String, dynamic>{
  'q': ?instance.q,
  'practiceAreaId': ?instance.practiceAreaId,
  'state': ?instance.state,
  'language': ?instance.language,
  'published': ?instance.published,
};
