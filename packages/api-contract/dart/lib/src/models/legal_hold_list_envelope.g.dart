// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_hold_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalHoldListEnvelope _$LegalHoldListEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalHoldListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => LegalHoldDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalHoldListEnvelopeToJson(
  LegalHoldListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
