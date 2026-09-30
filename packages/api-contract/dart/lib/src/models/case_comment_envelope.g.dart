// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_comment_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCommentEnvelope _$CaseCommentEnvelopeFromJson(Map<String, dynamic> json) =>
    CaseCommentEnvelope(
      data: CaseCommentDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$CaseCommentEnvelopeToJson(
  CaseCommentEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
