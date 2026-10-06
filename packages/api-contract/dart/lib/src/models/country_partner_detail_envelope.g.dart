// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerDetailEnvelope _$CountryPartnerDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => CountryPartnerDetailEnvelope(
  data: CountryPartnerDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CountryPartnerDetailEnvelopeToJson(
  CountryPartnerDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
