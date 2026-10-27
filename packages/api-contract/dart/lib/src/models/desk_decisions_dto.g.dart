// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_decisions_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskDecisionsDto _$DeskDecisionsDtoFromJson(Map<String, dynamic> json) =>
    DeskDecisionsDto(
      days: (json['days'] as List<dynamic>)
          .map((e) => DeskDecisionDayDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      decidedTotal: (json['decidedTotal'] as num).toInt(),
    );

Map<String, dynamic> _$DeskDecisionsDtoToJson(DeskDecisionsDto instance) =>
    <String, dynamic>{
      'days': instance.days.map((e) => e.toJson()).toList(),
      'decidedTotal': instance.decidedTotal,
    };
