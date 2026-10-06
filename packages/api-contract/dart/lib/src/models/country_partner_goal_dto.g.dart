// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_goal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerGoalDto _$CountryPartnerGoalDtoFromJson(
  Map<String, dynamic> json,
) => CountryPartnerGoalDto(
  metric: CountryPartnerGoalMetric.fromJson(json['metric'] as String),
  target: (json['target'] as num).toInt(),
  deadline: json['deadline'] as String,
);

Map<String, dynamic> _$CountryPartnerGoalDtoToJson(
  CountryPartnerGoalDto instance,
) => <String, dynamic>{
  'metric': instance.metric.toJson(),
  'target': instance.target,
  'deadline': instance.deadline,
};
