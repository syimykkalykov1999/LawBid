// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'call_history_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CallHistoryItemListEnvelope _$CallHistoryItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CallHistoryItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CallHistoryItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CallHistoryItemListEnvelopeToJson(
  CallHistoryItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
