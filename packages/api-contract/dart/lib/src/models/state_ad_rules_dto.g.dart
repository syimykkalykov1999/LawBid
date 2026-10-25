// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'state_ad_rules_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StateAdRulesDto _$StateAdRulesDtoFromJson(Map<String, dynamic> json) =>
    StateAdRulesDto(
      mode: StateAdRulesDtoMode.fromJson(json['mode'] as String),
      disabledRules: (json['disabledRules'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      archive: json['archive'] as bool,
      retentionYears: (json['retentionYears'] as num).toInt(),
      disclaimers: json['disclaimers'] as bool,
      resultsDisclaimer: json['resultsDisclaimer'] as String,
      adLabel: json['adLabel'] as String,
      bidPacksAllowed: json['bidPacksAllowed'] as bool,
      referralRewardsAllowed: json['referralRewardsAllowed'] as bool,
    );

Map<String, dynamic> _$StateAdRulesDtoToJson(StateAdRulesDto instance) =>
    <String, dynamic>{
      'mode': instance.mode.toJson(),
      'disabledRules': instance.disabledRules,
      'archive': instance.archive,
      'retentionYears': instance.retentionYears,
      'disclaimers': instance.disclaimers,
      'resultsDisclaimer': instance.resultsDisclaimer,
      'adLabel': instance.adLabel,
      'bidPacksAllowed': instance.bidPacksAllowed,
      'referralRewardsAllowed': instance.referralRewardsAllowed,
    };
