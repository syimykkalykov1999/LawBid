// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'built_document_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BuiltDocumentEnvelope _$BuiltDocumentEnvelopeFromJson(
  Map<String, dynamic> json,
) => BuiltDocumentEnvelope(
  data: BuiltDocumentDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$BuiltDocumentEnvelopeToJson(
  BuiltDocumentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
