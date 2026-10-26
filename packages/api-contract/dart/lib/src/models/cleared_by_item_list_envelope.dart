// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'cleared_by_item_dto.dart';
import 'response_meta_dto.dart';

part 'cleared_by_item_list_envelope.g.dart';

@JsonSerializable()
class ClearedByItemListEnvelope {
  const ClearedByItemListEnvelope({required this.data, this.meta});

  factory ClearedByItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClearedByItemListEnvelopeFromJson(json);

  final List<ClearedByItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClearedByItemListEnvelopeToJson(this);
}
