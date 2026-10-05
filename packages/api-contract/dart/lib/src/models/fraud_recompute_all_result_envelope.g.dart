// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_recompute_all_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudRecomputeAllResultEnvelope _$FraudRecomputeAllResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => FraudRecomputeAllResultEnvelope(
  data: FraudRecomputeAllResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FraudRecomputeAllResultEnvelopeToJson(
  FraudRecomputeAllResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
