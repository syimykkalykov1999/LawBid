// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_queue_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudQueueItemListEnvelope _$FraudQueueItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => FraudQueueItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => FraudQueueItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FraudQueueItemListEnvelopeToJson(
  FraudQueueItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
