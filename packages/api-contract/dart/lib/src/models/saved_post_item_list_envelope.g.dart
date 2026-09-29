// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_post_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedPostItemListEnvelope _$SavedPostItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SavedPostItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SavedPostItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SavedPostItemListEnvelopeToJson(
  SavedPostItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
