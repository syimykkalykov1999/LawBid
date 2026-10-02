// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'apply_referral_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ApplyReferralResultEnvelope _$ApplyReferralResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => ApplyReferralResultEnvelope(
  data: ApplyReferralResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ApplyReferralResultEnvelopeToJson(
  ApplyReferralResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
