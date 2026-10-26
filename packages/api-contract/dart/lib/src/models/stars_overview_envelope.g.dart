// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stars_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StarsOverviewEnvelope _$StarsOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => StarsOverviewEnvelope(
  data: StarsOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StarsOverviewEnvelopeToJson(
  StarsOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
