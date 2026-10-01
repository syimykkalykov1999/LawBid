// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'integrations_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IntegrationsOverviewEnvelope _$IntegrationsOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => IntegrationsOverviewEnvelope(
  data: IntegrationsOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IntegrationsOverviewEnvelopeToJson(
  IntegrationsOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
