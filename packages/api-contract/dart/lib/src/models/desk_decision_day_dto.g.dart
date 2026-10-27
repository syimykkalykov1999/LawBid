// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_decision_day_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskDecisionDayDto _$DeskDecisionDayDtoFromJson(Map<String, dynamic> json) =>
    DeskDecisionDayDto(
      day: json['day'] as String,
      decided: (json['decided'] as num).toInt(),
      avgHandleSec: (json['avgHandleSec'] as num).toInt(),
      reopened: (json['reopened'] as num).toInt(),
      lateSla: (json['lateSla'] as num).toInt(),
      skips: (json['skips'] as num).toInt(),
    );

Map<String, dynamic> _$DeskDecisionDayDtoToJson(DeskDecisionDayDto instance) =>
    <String, dynamic>{
      'day': instance.day,
      'decided': instance.decided,
      'avgHandleSec': instance.avgHandleSec,
      'reopened': instance.reopened,
      'lateSla': instance.lateSla,
      'skips': instance.skips,
    };
