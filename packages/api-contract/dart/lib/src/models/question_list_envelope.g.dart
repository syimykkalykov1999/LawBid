// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'question_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuestionListEnvelope _$QuestionListEnvelopeFromJson(
  Map<String, dynamic> json,
) => QuestionListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => QuestionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$QuestionListEnvelopeToJson(
  QuestionListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
