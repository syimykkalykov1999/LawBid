// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_pack_purchase_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidPackPurchaseEnvelope _$BidPackPurchaseEnvelopeFromJson(
  Map<String, dynamic> json,
) => BidPackPurchaseEnvelope(
  data: BidPackPurchaseDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BidPackPurchaseEnvelopeToJson(
  BidPackPurchaseEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
