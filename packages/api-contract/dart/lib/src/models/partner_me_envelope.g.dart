// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerMeEnvelope _$PartnerMeEnvelopeFromJson(Map<String, dynamic> json) =>
    PartnerMeEnvelope(
      data: PartnerMeDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$PartnerMeEnvelopeToJson(PartnerMeEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
