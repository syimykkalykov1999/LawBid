// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_pay_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerPayResultEnvelope _$AdminPartnerPayResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPartnerPayResultEnvelope(
  data: AdminPartnerPayResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPartnerPayResultEnvelopeToJson(
  AdminPartnerPayResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
