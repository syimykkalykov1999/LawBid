// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_goal_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerGoalViewDto _$CountryPartnerGoalViewDtoFromJson(
  Map<String, dynamic> json,
) => CountryPartnerGoalViewDto(
  metric: CountryPartnerGoalMetric.fromJson(json['metric'] as String),
  target: (json['target'] as num).toInt(),
  deadline: json['deadline'] as String,
  progress: (json['progress'] as num).toInt(),
  state: CountryPartnerGoalViewDtoState.fromJson(json['state'] as String),
);

Map<String, dynamic> _$CountryPartnerGoalViewDtoToJson(
  CountryPartnerGoalViewDto instance,
) => <String, dynamic>{
  'metric': instance.metric.toJson(),
  'target': instance.target,
  'deadline': instance.deadline,
  'progress': instance.progress,
  'state': instance.state.toJson(),
};
