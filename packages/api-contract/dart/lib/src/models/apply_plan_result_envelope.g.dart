// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'apply_plan_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ApplyPlanResultEnvelope _$ApplyPlanResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => ApplyPlanResultEnvelope(
  data: ApplyPlanResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ApplyPlanResultEnvelopeToJson(
  ApplyPlanResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
