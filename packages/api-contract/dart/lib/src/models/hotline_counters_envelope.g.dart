// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_counters_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineCountersEnvelope _$HotlineCountersEnvelopeFromJson(
  Map<String, dynamic> json,
) => HotlineCountersEnvelope(
  data: HotlineCountersDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$HotlineCountersEnvelopeToJson(
  HotlineCountersEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
