// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deadline_rule_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeadlineRuleDto _$DeadlineRuleDtoFromJson(Map<String, dynamic> json) =>
    DeadlineRuleDto(
      id: json['id'] as String,
      jurisdiction: json['jurisdiction'] as String,
      kind: DeadlineKind.fromJson(json['kind'] as String),
      code: json['code'] as String,
      labels: Map<String, String>.from(json['labels'] as Map),
      amount: (json['amount'] as num).toInt(),
      unit: DeadlineUnit.fromJson(json['unit'] as String),
      dayType: DeadlineDayType.fromJson(json['dayType'] as String),
      direction: DeadlineDirection.fromJson(json['direction'] as String),
      verified: json['verified'] as bool,
      practiceCode: json['practiceCode'] as String?,
      citation: json['citation'] as String?,
      notes: (json['notes'] as Map<String, dynamic>?)?.map(
        (k, e) => MapEntry(k, e as String),
      ),
      sourceUrl: json['sourceUrl'] as String?,
    );

Map<String, dynamic> _$DeadlineRuleDtoToJson(DeadlineRuleDto instance) =>
    <String, dynamic>{
      'id': instance.id,
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
      'verified': instance.verified,
    };
