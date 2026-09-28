// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'verification_queue_item_dto.dart';

part 'verification_queue_item_list_envelope.g.dart';

@JsonSerializable()
class VerificationQueueItemListEnvelope {
  const VerificationQueueItemListEnvelope({required this.data, this.meta});

  factory VerificationQueueItemListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$VerificationQueueItemListEnvelopeFromJson(json);

  final List<VerificationQueueItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$VerificationQueueItemListEnvelopeToJson(this);
}
