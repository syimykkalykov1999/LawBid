// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'requests_count_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RequestsCountEnvelope _$RequestsCountEnvelopeFromJson(
  Map<String, dynamic> json,
) => RequestsCountEnvelope(
  data: RequestsCountDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$RequestsCountEnvelopeToJson(
  RequestsCountEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
