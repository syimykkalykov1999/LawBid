// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_overview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchOverviewEnvelope _$SearchOverviewEnvelopeFromJson(
  Map<String, dynamic> json,
) => SearchOverviewEnvelope(
  data: SearchOverviewDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SearchOverviewEnvelopeToJson(
  SearchOverviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
