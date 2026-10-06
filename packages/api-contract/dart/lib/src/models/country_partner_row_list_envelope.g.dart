// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerRowListEnvelope _$CountryPartnerRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CountryPartnerRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CountryPartnerRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CountryPartnerRowListEnvelopeToJson(
  CountryPartnerRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
