// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'search_learned_link_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SearchLearnedLinkListEnvelope _$SearchLearnedLinkListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SearchLearnedLinkListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SearchLearnedLinkDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SearchLearnedLinkListEnvelopeToJson(
  SearchLearnedLinkListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
