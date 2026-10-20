// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'answer_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AnswerEnvelope _$AnswerEnvelopeFromJson(Map<String, dynamic> json) =>
    AnswerEnvelope(
      data: AnswerDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AnswerEnvelopeToJson(AnswerEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
