// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_admin_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryAdminEnvelope _$CountryAdminEnvelopeFromJson(
  Map<String, dynamic> json,
) => CountryAdminEnvelope(
  data: CountryAdminDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CountryAdminEnvelopeToJson(
  CountryAdminEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
