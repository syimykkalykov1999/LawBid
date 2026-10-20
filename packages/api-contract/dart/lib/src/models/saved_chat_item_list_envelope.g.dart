// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_chat_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedChatItemListEnvelope _$SavedChatItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SavedChatItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SavedChatItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SavedChatItemListEnvelopeToJson(
  SavedChatItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
