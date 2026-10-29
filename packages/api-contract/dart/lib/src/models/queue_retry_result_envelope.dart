// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'queue_retry_result_dto.dart';
import 'response_meta_dto.dart';

part 'queue_retry_result_envelope.g.dart';

@JsonSerializable()
class QueueRetryResultEnvelope {
  const QueueRetryResultEnvelope({
    required this.data,
    this.meta,
  });
  
  factory QueueRetryResultEnvelope.fromJson(Map<String, Object?> json) => _$QueueRetryResultEnvelopeFromJson(json);
  
  final QueueRetryResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QueueRetryResultEnvelopeToJson(this);
}
