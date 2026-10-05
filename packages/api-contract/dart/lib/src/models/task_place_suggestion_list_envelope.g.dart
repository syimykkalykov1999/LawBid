// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_place_suggestion_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskPlaceSuggestionListEnvelope _$TaskPlaceSuggestionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => TaskPlaceSuggestionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => TaskPlaceSuggestionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TaskPlaceSuggestionListEnvelopeToJson(
  TaskPlaceSuggestionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
