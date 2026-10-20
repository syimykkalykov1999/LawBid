// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_deadline_rule_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDeadlineRuleListEnvelope _$AdminDeadlineRuleListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDeadlineRuleListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminDeadlineRuleDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDeadlineRuleListEnvelopeToJson(
  AdminDeadlineRuleListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
