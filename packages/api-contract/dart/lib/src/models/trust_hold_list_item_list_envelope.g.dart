// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_hold_list_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustHoldListItemListEnvelope _$TrustHoldListItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => TrustHoldListItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => TrustHoldListItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TrustHoldListItemListEnvelopeToJson(
  TrustHoldListItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
