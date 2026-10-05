// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryListEnvelope _$CountryListEnvelopeFromJson(Map<String, dynamic> json) =>
    CountryListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => CountryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CountryListEnvelopeToJson(
  CountryListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
