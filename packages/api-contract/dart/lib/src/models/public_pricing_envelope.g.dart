// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'public_pricing_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PublicPricingEnvelope _$PublicPricingEnvelopeFromJson(
  Map<String, dynamic> json,
) => PublicPricingEnvelope(
  data: PublicPricingDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PublicPricingEnvelopeToJson(
  PublicPricingEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
