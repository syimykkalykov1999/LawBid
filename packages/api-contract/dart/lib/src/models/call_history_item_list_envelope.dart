// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_history_item_dto.dart';
import 'response_meta_dto.dart';

part 'call_history_item_list_envelope.g.dart';

@JsonSerializable()
class CallHistoryItemListEnvelope {
  const CallHistoryItemListEnvelope({required this.data, this.meta});

  factory CallHistoryItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CallHistoryItemListEnvelopeFromJson(json);

  final List<CallHistoryItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CallHistoryItemListEnvelopeToJson(this);
}
