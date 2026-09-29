// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_bid_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyBidItemListEnvelope _$MyBidItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => MyBidItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => MyBidItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MyBidItemListEnvelopeToJson(
  MyBidItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
