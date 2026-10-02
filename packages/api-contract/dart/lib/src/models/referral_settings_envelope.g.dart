// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_settings_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralSettingsEnvelope _$ReferralSettingsEnvelopeFromJson(
  Map<String, dynamic> json,
) => ReferralSettingsEnvelope(
  data: ReferralSettingsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReferralSettingsEnvelopeToJson(
  ReferralSettingsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
