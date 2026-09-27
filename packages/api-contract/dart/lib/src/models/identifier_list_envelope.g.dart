// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'identifier_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IdentifierListEnvelope _$IdentifierListEnvelopeFromJson(
  Map<String, dynamic> json,
) => IdentifierListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => IdentifierDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IdentifierListEnvelopeToJson(
  IdentifierListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
