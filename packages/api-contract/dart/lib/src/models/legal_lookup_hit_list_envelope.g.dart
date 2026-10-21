// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_lookup_hit_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalLookupHitListEnvelope _$LegalLookupHitListEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalLookupHitListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => LegalLookupHitDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalLookupHitListEnvelopeToJson(
  LegalLookupHitListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
