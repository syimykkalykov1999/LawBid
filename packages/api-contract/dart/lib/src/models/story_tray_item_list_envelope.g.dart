// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'story_tray_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StoryTrayItemListEnvelope _$StoryTrayItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StoryTrayItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StoryTrayItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StoryTrayItemListEnvelopeToJson(
  StoryTrayItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
