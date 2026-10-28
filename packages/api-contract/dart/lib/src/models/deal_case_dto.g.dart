// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deal_case_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DealCaseDto _$DealCaseDtoFromJson(Map<String, dynamic> json) => DealCaseDto(
  title: json['title'] as String,
  practice: json['practice'] as String?,
  states: (json['states'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$DealCaseDtoToJson(DealCaseDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'practice': ?instance.practice,
      'states': instance.states,
    };
