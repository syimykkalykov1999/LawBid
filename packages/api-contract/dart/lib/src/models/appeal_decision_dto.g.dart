// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'appeal_decision_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppealDecisionDto _$AppealDecisionDtoFromJson(Map<String, dynamic> json) =>
    AppealDecisionDto(
      accept: json['accept'] as bool,
      note: json['note'] as String,
    );

Map<String, dynamic> _$AppealDecisionDtoToJson(AppealDecisionDto instance) =>
    <String, dynamic>{'accept': instance.accept, 'note': instance.note};
