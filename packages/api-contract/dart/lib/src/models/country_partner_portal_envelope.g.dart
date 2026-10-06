// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_portal_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerPortalEnvelope _$CountryPartnerPortalEnvelopeFromJson(
  Map<String, dynamic> json,
) => CountryPartnerPortalEnvelope(
  data: CountryPartnerPortalDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CountryPartnerPortalEnvelopeToJson(
  CountryPartnerPortalEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
