// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkOverviewEnvelope _$PieceworkOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => PieceworkOverviewEnvelope(
  data: PieceworkOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PieceworkOverviewEnvelopeToJson(
  PieceworkOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
