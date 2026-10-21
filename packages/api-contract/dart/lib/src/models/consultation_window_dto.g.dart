// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'consultation_window_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConsultationWindowDto _$ConsultationWindowDtoFromJson(
  Map<String, dynamic> json,
) => ConsultationWindowDto(
  weekday: (json['weekday'] as num).toInt(),
  startMinute: (json['startMinute'] as num).toInt(),
  endMinute: (json['endMinute'] as num).toInt(),
);

Map<String, dynamic> _$ConsultationWindowDtoToJson(
  ConsultationWindowDto instance,
) => <String, dynamic>{
  'weekday': instance.weekday,
  'startMinute': instance.startMinute,
  'endMinute': instance.endMinute,
};
