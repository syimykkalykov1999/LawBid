// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_plan_prices_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPlanPricesEnvelope _$AdminPlanPricesEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPlanPricesEnvelope(
  data: AdminPlanPricesDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPlanPricesEnvelopeToJson(
  AdminPlanPricesEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
