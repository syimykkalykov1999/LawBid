// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fraud_ban_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FraudBanResultEnvelope _$FraudBanResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => FraudBanResultEnvelope(
  data: FraudBanResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$FraudBanResultEnvelopeToJson(
  FraudBanResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
