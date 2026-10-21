// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_deadline_rule_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateDeadlineRuleDto _$UpdateDeadlineRuleDtoFromJson(
  Map<String, dynamic> json,
) => UpdateDeadlineRuleDto(
  kind: json['kind'] == null
      ? null
      : UpdateDeadlineRuleDtoKind.fromJson(json['kind'] as String),
  labels: (json['labels'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  amount: (json['amount'] as num?)?.toInt(),
  unit: json['unit'] == null
      ? null
      : UpdateDeadlineRuleDtoUnit.fromJson(json['unit'] as String),
  dayType: json['dayType'] == null
      ? null
      : UpdateDeadlineRuleDtoDayType.fromJson(json['dayType'] as String),
  direction: json['direction'] == null
      ? null
      : UpdateDeadlineRuleDtoDirection.fromJson(json['direction'] as String),
  practiceCode: json['practiceCode'] as String?,
  citation: json['citation'] as String?,
  notes: (json['notes'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  sourceUrl: json['sourceUrl'] as String?,
  verified: json['verified'] as bool?,
  isActive: json['isActive'] as bool?,
  sort: (json['sort'] as num?)?.toInt(),
);

Map<String, dynamic> _$UpdateDeadlineRuleDtoToJson(
  UpdateDeadlineRuleDto instance,
) => <String, dynamic>{
  'kind': ?instance.kind?.toJson(),
  'labels': ?instance.labels,
  'amount': ?instance.amount,
  'unit': ?instance.unit?.toJson(),
  'dayType': ?instance.dayType?.toJson(),
  'direction': ?instance.direction?.toJson(),
  'practiceCode': ?instance.practiceCode,
  'citation': ?instance.citation,
  'notes': ?instance.notes,
  'sourceUrl': ?instance.sourceUrl,
  'verified': ?instance.verified,
  'isActive': ?instance.isActive,
  'sort': ?instance.sort,
};
