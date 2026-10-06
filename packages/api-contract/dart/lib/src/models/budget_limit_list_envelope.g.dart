// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'budget_limit_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BudgetLimitListEnvelope _$BudgetLimitListEnvelopeFromJson(
  Map<String, dynamic> json,
) => BudgetLimitListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => BudgetLimitDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BudgetLimitListEnvelopeToJson(
  BudgetLimitListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
