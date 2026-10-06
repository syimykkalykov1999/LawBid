// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_contract_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerContractEnvelope _$CountryPartnerContractEnvelopeFromJson(
  Map<String, dynamic> json,
) => CountryPartnerContractEnvelope(
  data: CountryPartnerContractDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CountryPartnerContractEnvelopeToJson(
  CountryPartnerContractEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
