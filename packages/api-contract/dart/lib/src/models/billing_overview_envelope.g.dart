// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'billing_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BillingOverviewEnvelope _$BillingOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => BillingOverviewEnvelope(
  data: BillingOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BillingOverviewEnvelopeToJson(
  BillingOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
