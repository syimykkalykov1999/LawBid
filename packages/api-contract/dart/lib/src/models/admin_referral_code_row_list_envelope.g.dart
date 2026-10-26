// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_code_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralCodeRowListEnvelope _$AdminReferralCodeRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminReferralCodeRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminReferralCodeRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminReferralCodeRowListEnvelopeToJson(
  AdminReferralCodeRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
