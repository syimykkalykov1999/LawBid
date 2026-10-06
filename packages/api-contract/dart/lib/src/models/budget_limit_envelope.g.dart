// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'budget_limit_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BudgetLimitEnvelope _$BudgetLimitEnvelopeFromJson(Map<String, dynamic> json) =>
    BudgetLimitEnvelope(
      data: BudgetLimitDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BudgetLimitEnvelopeToJson(
  BudgetLimitEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
