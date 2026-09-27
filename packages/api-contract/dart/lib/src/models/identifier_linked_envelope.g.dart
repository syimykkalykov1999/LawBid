// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'identifier_linked_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

IdentifierLinkedEnvelope _$IdentifierLinkedEnvelopeFromJson(
  Map<String, dynamic> json,
) => IdentifierLinkedEnvelope(
  data: IdentifierLinkedDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$IdentifierLinkedEnvelopeToJson(
  IdentifierLinkedEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
