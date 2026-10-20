// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'journal_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

JournalItemListEnvelope _$JournalItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => JournalItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => JournalItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$JournalItemListEnvelopeToJson(
  JournalItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
