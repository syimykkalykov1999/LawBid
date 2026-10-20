// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'delivered_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeliveredResultEnvelope _$DeliveredResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => DeliveredResultEnvelope(
  data: DeliveredResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$DeliveredResultEnvelopeToJson(
  DeliveredResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
