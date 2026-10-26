// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_deadline_rule_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateDeadlineRuleDto _$CreateDeadlineRuleDtoFromJson(
  Map<String, dynamic> json,
) => CreateDeadlineRuleDto(
  jurisdiction: json['jurisdiction'] as String,
  kind: CreateDeadlineRuleDtoKind.fromJson(json['kind'] as String),
  code: json['code'] as String,
  labels: Map<String, String>.from(json['labels'] as Map),
  amount: (json['amount'] as num).toInt(),
  practiceCode: json['practiceCode'] as String?,
  citation: json['citation'] as String?,
  notes: (json['notes'] as Map<String, dynamic>?)?.map(
    (k, e) => MapEntry(k, e as String),
  ),
  sourceUrl: json['sourceUrl'] as String?,
  verified: json['verified'] as bool?,
  unit: json['unit'] == null
      ? CreateDeadlineRuleDtoUnit.day
      : CreateDeadlineRuleDtoUnit.fromJson(json['unit'] as String),
  dayType: json['dayType'] == null
      ? CreateDeadlineRuleDtoDayType.calendar
      : CreateDeadlineRuleDtoDayType.fromJson(json['dayType'] as String),
  direction: json['direction'] == null
      ? CreateDeadlineRuleDtoDirection.after
      : CreateDeadlineRuleDtoDirection.fromJson(json['direction'] as String),
  isActive: json['isActive'] as bool? ?? true,
  sort: (json['sort'] as num?)?.toInt() ?? 0,
);

Map<String, dynamic> _$CreateDeadlineRuleDtoToJson(
  CreateDeadlineRuleDto instance,
) => <String, dynamic>{
  'jurisdiction': instance.jurisdiction,
  'kind': instance.kind.toJson(),
  'code': instance.code,
  'labels': instance.labels,
  'amount': instance.amount,
  'unit': instance.unit.toJson(),
  'dayType': instance.dayType.toJson(),
  'direction': instance.direction.toJson(),
  'practiceCode': ?instance.practiceCode,
  'citation': ?instance.citation,
  'notes': ?instance.notes,
  'sourceUrl': ?instance.sourceUrl,
  'verified': ?instance.verified,
  'isActive': instance.isActive,
  'sort': instance.sort,
};
