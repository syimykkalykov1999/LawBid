// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_recover_question_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminRecoverQuestionResultEnvelope _$AdminRecoverQuestionResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminRecoverQuestionResultEnvelope(
  data: AdminRecoverQuestionResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminRecoverQuestionResultEnvelopeToJson(
  AdminRecoverQuestionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
