// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'task_person_suggestion_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TaskPersonSuggestionListEnvelope _$TaskPersonSuggestionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => TaskPersonSuggestionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => TaskPersonSuggestionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$TaskPersonSuggestionListEnvelopeToJson(
  TaskPersonSuggestionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
