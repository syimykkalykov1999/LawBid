// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'question_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuestionEnvelope _$QuestionEnvelopeFromJson(Map<String, dynamic> json) =>
    QuestionEnvelope(
      data: QuestionDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$QuestionEnvelopeToJson(QuestionEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
