// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'synonym_group_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SynonymGroupListEnvelope _$SynonymGroupListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SynonymGroupListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SynonymGroupDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SynonymGroupListEnvelopeToJson(
  SynonymGroupListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
