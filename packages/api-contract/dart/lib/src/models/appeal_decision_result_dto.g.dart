// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'appeal_decision_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppealDecisionResultDto _$AppealDecisionResultDtoFromJson(
  Map<String, dynamic> json,
) => AppealDecisionResultDto(
  status: AppealDecisionResultDtoStatus.fromJson(json['status'] as String),
);

Map<String, dynamic> _$AppealDecisionResultDtoToJson(
  AppealDecisionResultDto instance,
) => <String, dynamic>{'status': instance.status.toJson()};
