// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'multipart_plan_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MultipartPlanEnvelope _$MultipartPlanEnvelopeFromJson(
  Map<String, dynamic> json,
) => MultipartPlanEnvelope(
  data: MultipartPlanDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$MultipartPlanEnvelopeToJson(
  MultipartPlanEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
