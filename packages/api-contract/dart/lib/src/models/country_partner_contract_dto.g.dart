// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_contract_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerContractDto _$CountryPartnerContractDtoFromJson(
  Map<String, dynamic> json,
) => CountryPartnerContractDto(
  version: (json['version'] as num).toInt(),
  text: json['text'] as String,
  updatedAt: json['updatedAt'] == null
      ? null
      : DateTime.parse(json['updatedAt'] as String),
);

Map<String, dynamic> _$CountryPartnerContractDtoToJson(
  CountryPartnerContractDto instance,
) => <String, dynamic>{
  'version': instance.version,
  'text': instance.text,
  'updatedAt': ?instance.updatedAt?.toIso8601String(),
};
