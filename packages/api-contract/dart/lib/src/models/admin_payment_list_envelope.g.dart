// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_payment_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPaymentListEnvelope _$AdminPaymentListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPaymentListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminPaymentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPaymentListEnvelopeToJson(
  AdminPaymentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
