// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_comment_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseCommentListEnvelope _$CaseCommentListEnvelopeFromJson(
  Map<String, dynamic> json,
) => CaseCommentListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => CaseCommentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$CaseCommentListEnvelopeToJson(
  CaseCommentListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
