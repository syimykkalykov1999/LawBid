// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_dispute_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminDisputeListEnvelope _$AdminDisputeListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminDisputeListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminDisputeDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminDisputeListEnvelopeToJson(
  AdminDisputeListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
