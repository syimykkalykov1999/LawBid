// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'promotion_dry_run_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PromotionDryRunResultEnvelope _$PromotionDryRunResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => PromotionDryRunResultEnvelope(
  data: PromotionDryRunResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PromotionDryRunResultEnvelopeToJson(
  PromotionDryRunResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
