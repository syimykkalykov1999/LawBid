// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_queue_item_dto_queue_reason.dart';
import 'fraud_signal_dto.dart';
import 'fraud_status.dart';
import 'fraud_user_dto.dart';

part 'fraud_queue_item_dto.g.dart';

@JsonSerializable()
class FraudQueueItemDto {
  const FraudQueueItemDto({
    required this.user,
    required this.score,
    required this.status,
    required this.queueReason,
    required this.queuedAt,
    required this.signals,
    required this.linkedUserId,
    required this.computedAt,
  });

  factory FraudQueueItemDto.fromJson(Map<String, Object?> json) =>
      _$FraudQueueItemDtoFromJson(json);

  final FraudUserDto user;
  final num score;
  final FraudStatus status;
  final FraudQueueItemDtoQueueReason? queueReason;
  final DateTime? queuedAt;
  final List<FraudSignalDto> signals;
  final String? linkedUserId;
  final DateTime computedAt;

  Map<String, Object?> toJson() => _$FraudQueueItemDtoToJson(this);
}
