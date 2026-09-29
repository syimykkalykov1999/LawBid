// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'person_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PersonItemListEnvelope _$PersonItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => PersonItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => PersonItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PersonItemListEnvelopeToJson(
  PersonItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
