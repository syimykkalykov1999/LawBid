// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'fraud_queue_item_dto.dart';
import 'response_meta_dto.dart';

part 'fraud_queue_item_list_envelope.g.dart';

@JsonSerializable()
class FraudQueueItemListEnvelope {
  const FraudQueueItemListEnvelope({required this.data, this.meta});

  factory FraudQueueItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$FraudQueueItemListEnvelopeFromJson(json);

  final List<FraudQueueItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$FraudQueueItemListEnvelopeToJson(this);
}
