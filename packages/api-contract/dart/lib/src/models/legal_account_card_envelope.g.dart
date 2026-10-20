// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_account_card_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalAccountCardEnvelope _$LegalAccountCardEnvelopeFromJson(
  Map<String, dynamic> json,
) => LegalAccountCardEnvelope(
  data: LegalAccountCardDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$LegalAccountCardEnvelopeToJson(
  LegalAccountCardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
