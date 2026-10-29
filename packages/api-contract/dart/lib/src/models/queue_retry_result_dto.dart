// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'queue_retry_result_dto.g.dart';

@JsonSerializable()
class QueueRetryResultDto {
  const QueueRetryResultDto({
    required this.retried,
    required this.stripeReplayed,
    required this.byQueue,
  });
  
  factory QueueRetryResultDto.fromJson(Map<String, Object?> json) => _$QueueRetryResultDtoFromJson(json);
  
  /// Failed jobs put back in their queues.
  final num retried;

  /// Stripe events moved from the dead-letter queue to processing.
  final num stripeReplayed;

  /// Per queue: failed jobs retried.
  final Map<String, num> byQueue;

  Map<String, Object?> toJson() => _$QueueRetryResultDtoToJson(this);
}
