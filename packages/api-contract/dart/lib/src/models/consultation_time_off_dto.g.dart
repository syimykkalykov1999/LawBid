// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_time_off_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationTimeOffDto _$ConsultationTimeOffDtoFromJson(
  Map<String, dynamic> json,
) => ConsultationTimeOffDto(
  startsOn: json['startsOn'] as String,
  endsOn: json['endsOn'] as String,
  note: json['note'] as String?,
);

Map<String, dynamic> _$ConsultationTimeOffDtoToJson(
  ConsultationTimeOffDto instance,
) => <String, dynamic>{
  'startsOn': instance.startsOn,
  'endsOn': instance.endsOn,
  'note': ?instance.note,
};
