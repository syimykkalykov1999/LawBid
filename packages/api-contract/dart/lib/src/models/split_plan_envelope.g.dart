// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'split_plan_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SplitPlanEnvelope _$SplitPlanEnvelopeFromJson(Map<String, dynamic> json) =>
    SplitPlanEnvelope(
      data: SplitPlanDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$SplitPlanEnvelopeToJson(SplitPlanEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
