// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'queue_retry_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QueueRetryResultEnvelope _$QueueRetryResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => QueueRetryResultEnvelope(
  data: QueueRetryResultDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$QueueRetryResultEnvelopeToJson(
  QueueRetryResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
