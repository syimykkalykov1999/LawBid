// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_queue_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationQueueItemListEnvelope _$ModerationQueueItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ModerationQueueItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ModerationQueueItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ModerationQueueItemListEnvelopeToJson(
  ModerationQueueItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
