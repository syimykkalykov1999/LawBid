// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_query_stat_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchQueryStatListEnvelope _$SearchQueryStatListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SearchQueryStatListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SearchQueryStatDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SearchQueryStatListEnvelopeToJson(
  SearchQueryStatListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
