// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_bid_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseBidItemListEnvelope _$CaseBidItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseBidItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CaseBidItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseBidItemListEnvelopeToJson(
  CaseBidItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
