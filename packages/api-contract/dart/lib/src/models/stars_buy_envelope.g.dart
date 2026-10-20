// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_buy_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsBuyEnvelope _$StarsBuyEnvelopeFromJson(Map<String, dynamic> json) =>
    StarsBuyEnvelope(
      data: StarsBuyDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$StarsBuyEnvelopeToJson(StarsBuyEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
