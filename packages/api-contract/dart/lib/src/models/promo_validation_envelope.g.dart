// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promo_validation_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromoValidationEnvelope _$PromoValidationEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromoValidationEnvelope(
  data: PromoValidationDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromoValidationEnvelopeToJson(
  PromoValidationEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
