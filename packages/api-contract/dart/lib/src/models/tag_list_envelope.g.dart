// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tag_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TagListEnvelope _$TagListEnvelopeFromJson(Map<String, dynamic> json) =>
    TagListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map((e) => TagDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$TagListEnvelopeToJson(TagListEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.map((e) => e.toJson()).toList(),
      'meta': ?instance.meta?.toJson(),
    };
