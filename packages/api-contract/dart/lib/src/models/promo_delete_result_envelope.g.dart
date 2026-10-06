// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_delete_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoDeleteResultEnvelope _$PromoDeleteResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromoDeleteResultEnvelope(
  data: PromoDeleteResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromoDeleteResultEnvelopeToJson(
  PromoDeleteResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
