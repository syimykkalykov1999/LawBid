// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_queue_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustQueueItemListEnvelope _$TrustQueueItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => TrustQueueItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => TrustQueueItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TrustQueueItemListEnvelopeToJson(
  TrustQueueItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
