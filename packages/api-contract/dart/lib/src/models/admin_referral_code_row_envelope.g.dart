// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_code_row_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralCodeRowEnvelope _$AdminReferralCodeRowEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminReferralCodeRowEnvelope(
  data: AdminReferralCodeRowDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminReferralCodeRowEnvelopeToJson(
  AdminReferralCodeRowEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
