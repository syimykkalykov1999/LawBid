// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'suggestion_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SuggestionListEnvelope _$SuggestionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => SuggestionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => SuggestionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SuggestionListEnvelopeToJson(
  SuggestionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
