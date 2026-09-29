// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'work_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

WorkItemListEnvelope _$WorkItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => WorkItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => WorkItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$WorkItemListEnvelopeToJson(
  WorkItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
