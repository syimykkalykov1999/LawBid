// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_decision_of_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffDecisionOfDayDto _$StaffDecisionOfDayDtoFromJson(
  Map<String, dynamic> json,
) => StaffDecisionOfDayDto(
  code: json['code'] as String,
  title: json['title'] as String,
  text: json['text'] as String,
  href: json['href'] as String,
);

Map<String, dynamic> _$StaffDecisionOfDayDtoToJson(
  StaffDecisionOfDayDto instance,
) => <String, dynamic>{
  'code': instance.code,
  'title': instance.title,
  'text': instance.text,
  'href': instance.href,
};
