// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_redemption_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoRedemptionListEnvelope _$PromoRedemptionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromoRedemptionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PromoRedemptionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromoRedemptionListEnvelopeToJson(
  PromoRedemptionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
