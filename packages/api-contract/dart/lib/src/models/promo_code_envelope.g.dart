// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_code_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoCodeEnvelope _$PromoCodeEnvelopeFromJson(Map<String, dynamic> json) =>
    PromoCodeEnvelope(
      data: PromoCodeDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PromoCodeEnvelopeToJson(PromoCodeEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
