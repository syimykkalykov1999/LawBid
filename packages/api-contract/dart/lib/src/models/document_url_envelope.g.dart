// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'document_url_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DocumentUrlEnvelope _$DocumentUrlEnvelopeFromJson(Map<String, dynamic> json) =>
    DocumentUrlEnvelope(
      data: DocumentUrlDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DocumentUrlEnvelopeToJson(
  DocumentUrlEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
