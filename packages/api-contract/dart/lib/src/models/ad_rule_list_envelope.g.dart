// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ad_rule_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdRuleListEnvelope _$AdRuleListEnvelopeFromJson(Map<String, dynamic> json) =>
    AdRuleListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => AdRuleDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdRuleListEnvelopeToJson(AdRuleListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.map((e) => e.toJson()).toList(),
      'meta': ?instance.meta?.toJson(),
    };
