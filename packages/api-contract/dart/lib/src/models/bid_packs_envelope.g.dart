// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_packs_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidPacksEnvelope _$BidPacksEnvelopeFromJson(Map<String, dynamic> json) =>
    BidPacksEnvelope(
      data: BidPacksDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BidPacksEnvelopeToJson(BidPacksEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
