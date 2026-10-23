// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'link_preview_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LinkPreviewEnvelope _$LinkPreviewEnvelopeFromJson(Map<String, dynamic> json) =>
    LinkPreviewEnvelope(
      data: LinkPreviewDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$LinkPreviewEnvelopeToJson(
  LinkPreviewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
