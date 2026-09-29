// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_feed_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseFeedItemListEnvelope _$CaseFeedItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseFeedItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CaseFeedItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseFeedItemListEnvelopeToJson(
  CaseFeedItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
