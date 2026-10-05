// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'trust_queue_item_dto.dart';

part 'trust_queue_item_list_envelope.g.dart';

@JsonSerializable()
class TrustQueueItemListEnvelope {
  const TrustQueueItemListEnvelope({required this.data, this.meta});

  factory TrustQueueItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$TrustQueueItemListEnvelopeFromJson(json);

  final List<TrustQueueItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TrustQueueItemListEnvelopeToJson(this);
}
