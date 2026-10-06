// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_goal_metric.dart';
import 'country_partner_goal_view_dto_state.dart';

part 'country_partner_goal_view_dto.g.dart';

@JsonSerializable()
class CountryPartnerGoalViewDto {
  const CountryPartnerGoalViewDto({
    required this.metric,
    required this.target,
    required this.deadline,
    required this.progress,
    required this.state,
  });

  factory CountryPartnerGoalViewDto.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerGoalViewDtoFromJson(json);

  final CountryPartnerGoalMetric metric;

  /// People, or cents for revenue_cents.
  final int target;
  final String deadline;
  final int progress;
  final CountryPartnerGoalViewDtoState state;

  Map<String, Object?> toJson() => _$CountryPartnerGoalViewDtoToJson(this);
}
