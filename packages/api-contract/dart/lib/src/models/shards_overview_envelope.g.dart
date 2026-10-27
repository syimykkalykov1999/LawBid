// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shards_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ShardsOverviewEnvelope _$ShardsOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => ShardsOverviewEnvelope(
  data: ShardsOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ShardsOverviewEnvelopeToJson(
  ShardsOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
