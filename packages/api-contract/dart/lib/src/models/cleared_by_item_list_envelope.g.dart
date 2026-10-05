// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cleared_by_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClearedByItemListEnvelope _$ClearedByItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => ClearedByItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => ClearedByItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ClearedByItemListEnvelopeToJson(
  ClearedByItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
