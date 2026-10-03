// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_set_plan_price_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminSetPlanPriceResultEnvelope _$AdminSetPlanPriceResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminSetPlanPriceResultEnvelope(
  data: AdminSetPlanPriceResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminSetPlanPriceResultEnvelopeToJson(
  AdminSetPlanPriceResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
