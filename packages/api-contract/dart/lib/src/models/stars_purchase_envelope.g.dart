// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_purchase_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsPurchaseEnvelope _$StarsPurchaseEnvelopeFromJson(
  Map<String, dynamic> json,
) => StarsPurchaseEnvelope(
  data: StarsPurchaseDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StarsPurchaseEnvelopeToJson(
  StarsPurchaseEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
