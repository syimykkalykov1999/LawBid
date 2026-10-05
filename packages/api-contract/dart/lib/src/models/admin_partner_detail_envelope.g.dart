// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerDetailEnvelope _$AdminPartnerDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPartnerDetailEnvelope(
  data: AdminPartnerDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPartnerDetailEnvelopeToJson(
  AdminPartnerDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
