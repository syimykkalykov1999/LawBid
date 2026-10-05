// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bulk_countries_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BulkCountriesResultEnvelope _$BulkCountriesResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => BulkCountriesResultEnvelope(
  data: BulkCountriesResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BulkCountriesResultEnvelopeToJson(
  BulkCountriesResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
