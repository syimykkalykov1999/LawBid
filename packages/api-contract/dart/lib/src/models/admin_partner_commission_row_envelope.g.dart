// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_commission_row_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerCommissionRowEnvelope _$AdminPartnerCommissionRowEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPartnerCommissionRowEnvelope(
  data: AdminPartnerCommissionRowDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPartnerCommissionRowEnvelopeToJson(
  AdminPartnerCommissionRowEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
