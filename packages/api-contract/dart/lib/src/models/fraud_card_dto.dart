// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_card_dto_queue_reason.dart';
import 'fraud_event_dto.dart';
import 'fraud_linked_account_dto.dart';
import 'fraud_signal_dto.dart';
import 'fraud_status.dart';
import 'fraud_user_dto.dart';

part 'fraud_card_dto.g.dart';

@JsonSerializable()
class FraudCardDto {
  const FraudCardDto({
    required this.user,
    required this.score,
    required this.status,
    required this.queueReason,
    required this.queuedAt,
    required this.signals,
    required this.linkedUserId,
    required this.computedAt,
    required this.linked,
    required this.events,
    required this.clearedScore,
    required this.clearedAt,
  });

  factory FraudCardDto.fromJson(Map<String, Object?> json) =>
      _$FraudCardDtoFromJson(json);

  final FraudUserDto user;
  final num score;
  final FraudStatus status;
  final FraudCardDtoQueueReason? queueReason;
  final DateTime? queuedAt;
  final List<FraudSignalDto> signals;
  final String? linkedUserId;
  final DateTime computedAt;
  final List<FraudLinkedAccountDto> linked;
  final List<FraudEventDto> events;
  final num? clearedScore;
  final DateTime? clearedAt;

  Map<String, Object?> toJson() => _$FraudCardDtoToJson(this);
}
