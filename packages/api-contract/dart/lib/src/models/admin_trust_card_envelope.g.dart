// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_trust_card_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTrustCardEnvelope _$AdminTrustCardEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminTrustCardEnvelope(
  data: AdminTrustCardDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminTrustCardEnvelopeToJson(
  AdminTrustCardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
