// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_index_status_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchIndexStatusEnvelope _$SearchIndexStatusEnvelopeFromJson(
  Map<String, dynamic> json,
) => SearchIndexStatusEnvelope(
  data: SearchIndexStatusDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SearchIndexStatusEnvelopeToJson(
  SearchIndexStatusEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
