// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_pack_buy_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidPackBuyEnvelope _$BidPackBuyEnvelopeFromJson(Map<String, dynamic> json) =>
    BidPackBuyEnvelope(
      data: BidPackBuyDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BidPackBuyEnvelopeToJson(BidPackBuyEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
