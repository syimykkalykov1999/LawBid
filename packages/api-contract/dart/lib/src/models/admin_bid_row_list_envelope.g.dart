// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bid_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBidRowListEnvelope _$AdminBidRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminBidRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminBidRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminBidRowListEnvelopeToJson(
  AdminBidRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
