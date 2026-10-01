// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_step_up_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminStepUpResultEnvelope _$AdminStepUpResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminStepUpResultEnvelope(
  data: AdminStepUpResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminStepUpResultEnvelopeToJson(
  AdminStepUpResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
