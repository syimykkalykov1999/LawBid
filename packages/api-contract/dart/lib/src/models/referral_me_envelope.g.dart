// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_me_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralMeEnvelope _$ReferralMeEnvelopeFromJson(Map<String, dynamic> json) =>
    ReferralMeEnvelope(
      data: ReferralMeDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$ReferralMeEnvelopeToJson(ReferralMeEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
