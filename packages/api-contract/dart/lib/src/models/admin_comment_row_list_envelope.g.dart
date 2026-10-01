// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_comment_row_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCommentRowListEnvelope _$AdminCommentRowListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminCommentRowListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminCommentRowDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminCommentRowListEnvelopeToJson(
  AdminCommentRowListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
