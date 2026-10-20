// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_deadline_rule_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDeadlineRuleEnvelope _$AdminDeadlineRuleEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDeadlineRuleEnvelope(
  data: AdminDeadlineRuleDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDeadlineRuleEnvelopeToJson(
  AdminDeadlineRuleEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
