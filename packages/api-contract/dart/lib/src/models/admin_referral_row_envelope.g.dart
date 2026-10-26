// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_row_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralRowEnvelope _$AdminReferralRowEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminReferralRowEnvelope(
  data: AdminReferralRowDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminReferralRowEnvelopeToJson(
  AdminReferralRowEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
