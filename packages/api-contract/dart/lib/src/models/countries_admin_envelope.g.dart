// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'countries_admin_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountriesAdminEnvelope _$CountriesAdminEnvelopeFromJson(
  Map<String, dynamic> json,
) => CountriesAdminEnvelope(
  data: CountriesAdminDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CountriesAdminEnvelopeToJson(
  CountriesAdminEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
