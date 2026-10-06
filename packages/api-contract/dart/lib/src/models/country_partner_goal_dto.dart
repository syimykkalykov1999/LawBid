// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_goal_metric.dart';

part 'country_partner_goal_dto.g.dart';

@JsonSerializable()
class CountryPartnerGoalDto {
  const CountryPartnerGoalDto({
    required this.metric,
    required this.target,
    required this.deadline,
  });

  factory CountryPartnerGoalDto.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerGoalDtoFromJson(json);

  final CountryPartnerGoalMetric metric;

  /// People, or cents for revenue_cents.
  final int target;
  final String deadline;

  Map<String, Object?> toJson() => _$CountryPartnerGoalDtoToJson(this);
}
