// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_code_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoCodeListEnvelope _$PromoCodeListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromoCodeListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PromoCodeDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromoCodeListEnvelopeToJson(
  PromoCodeListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
