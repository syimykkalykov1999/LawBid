// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_qa_question_detail_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminQaQuestionDetailEnvelope _$AdminQaQuestionDetailEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminQaQuestionDetailEnvelope(
  data: AdminQaQuestionDetailDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminQaQuestionDetailEnvelopeToJson(
  AdminQaQuestionDetailEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
