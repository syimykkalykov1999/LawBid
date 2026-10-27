// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'state_ad_rules_dto_mode.dart';

part 'state_ad_rules_dto.g.dart';

@JsonSerializable()
class StateAdRulesDto {
  const StateAdRulesDto({
    required this.mode,
    required this.disabledRules,
    required this.archive,
    required this.retentionYears,
    required this.disclaimers,
    required this.resultsDisclaimer,
    required this.adLabel,
    required this.bidPacksAllowed,
    required this.referralRewardsAllowed,
  });

  factory StateAdRulesDto.fromJson(Map<String, Object?> json) =>
      _$StateAdRulesDtoFromJson(json);

  final StateAdRulesDtoMode mode;
  final List<String> disabledRules;
  final bool archive;
  final int retentionYears;
  final bool disclaimers;
  final String resultsDisclaimer;
  final String adLabel;
  final bool bidPacksAllowed;
  final bool referralRewardsAllowed;

  Map<String, Object?> toJson() => _$StateAdRulesDtoToJson(this);
}
