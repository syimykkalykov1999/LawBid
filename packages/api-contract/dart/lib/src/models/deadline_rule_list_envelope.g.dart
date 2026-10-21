// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deadline_rule_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeadlineRuleListEnvelope _$DeadlineRuleListEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeadlineRuleListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => DeadlineRuleDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeadlineRuleListEnvelopeToJson(
  DeadlineRuleListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
