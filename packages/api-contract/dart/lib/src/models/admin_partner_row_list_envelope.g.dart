// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerRowListEnvelope _$AdminPartnerRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPartnerRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminPartnerRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPartnerRowListEnvelopeToJson(
  AdminPartnerRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
