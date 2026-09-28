// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidEnvelope _$BidEnvelopeFromJson(Map<String, dynamic> json) => BidEnvelope(
  data: BidDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BidEnvelopeToJson(BidEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
