// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'verification_queue_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VerificationQueueItemListEnvelope _$VerificationQueueItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => VerificationQueueItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => VerificationQueueItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$VerificationQueueItemListEnvelopeToJson(
  VerificationQueueItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
