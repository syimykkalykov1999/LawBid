// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'synonym_test_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SynonymTestEnvelope _$SynonymTestEnvelopeFromJson(Map<String, dynamic> json) =>
    SynonymTestEnvelope(
      data: SynonymTestDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SynonymTestEnvelopeToJson(
  SynonymTestEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
