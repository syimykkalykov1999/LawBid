// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'infra_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InfraOverviewEnvelope _$InfraOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => InfraOverviewEnvelope(
  data: InfraOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$InfraOverviewEnvelopeToJson(
  InfraOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
