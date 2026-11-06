// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dispute_refund_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDisputeRefundListEnvelope _$AdminDisputeRefundListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDisputeRefundListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminDisputeRefundDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDisputeRefundListEnvelopeToJson(
  AdminDisputeRefundListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
