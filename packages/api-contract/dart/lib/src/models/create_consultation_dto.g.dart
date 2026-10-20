// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_consultation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateConsultationDto _$CreateConsultationDtoFromJson(
  Map<String, dynamic> json,
) => CreateConsultationDto(
  attorneyId: json['attorneyId'] as String,
  startsAt: json['startsAt'] as String,
  note: json['note'] as String?,
  caseId: json['caseId'] as String?,
);

Map<String, dynamic> _$CreateConsultationDtoToJson(
  CreateConsultationDto instance,
) => <String, dynamic>{
  'attorneyId': instance.attorneyId,
  'startsAt': instance.startsAt,
  'note': ?instance.note,
  'caseId': ?instance.caseId,
};
