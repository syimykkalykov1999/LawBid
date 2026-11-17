// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_join_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidJoinEnvelope _$BidJoinEnvelopeFromJson(Map<String, dynamic> json) =>
    BidJoinEnvelope(
      data: BidJoinDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$BidJoinEnvelopeToJson(BidJoinEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
