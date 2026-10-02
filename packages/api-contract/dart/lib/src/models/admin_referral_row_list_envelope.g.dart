// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralRowListEnvelope _$AdminReferralRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminReferralRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminReferralRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminReferralRowListEnvelopeToJson(
  AdminReferralRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
