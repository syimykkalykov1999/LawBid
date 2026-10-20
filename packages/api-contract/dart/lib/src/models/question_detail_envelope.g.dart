// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'question_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QuestionDetailEnvelope _$QuestionDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => QuestionDetailEnvelope(
  data: QuestionDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$QuestionDetailEnvelopeToJson(
  QuestionDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
