// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ad_rule_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdRuleDto _$AdRuleDtoFromJson(Map<String, dynamic> json) => AdRuleDto(
  id: json['id'] as String,
  severity: AdRuleDtoSeverity.fromJson(json['severity'] as String),
  reference: json['reference'] as String,
  messageEn: json['messageEn'] as String,
  messageRu: json['messageRu'] as String,
);

Map<String, dynamic> _$AdRuleDtoToJson(AdRuleDto instance) => <String, dynamic>{
  'id': instance.id,
  'severity': instance.severity.toJson(),
  'reference': instance.reference,
  'messageEn': instance.messageEn,
  'messageRu': instance.messageRu,
};
