// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_commission_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerCommissionRowListEnvelope
_$AdminPartnerCommissionRowListEnvelopeFromJson(Map<String, dynamic> json) =>
    AdminPartnerCommissionRowListEnvelope(
      data: (json['data'] as List<dynamic>)
          .map(
            (e) => AdminPartnerCommissionRowDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AdminPartnerCommissionRowListEnvelopeToJson(
  AdminPartnerCommissionRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
