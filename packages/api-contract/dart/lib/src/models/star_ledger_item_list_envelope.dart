// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'star_ledger_item_dto.dart';

part 'star_ledger_item_list_envelope.g.dart';

@JsonSerializable()
class StarLedgerItemListEnvelope {
  const StarLedgerItemListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory StarLedgerItemListEnvelope.fromJson(Map<String, Object?> json) => _$StarLedgerItemListEnvelopeFromJson(json);
  
  final List<StarLedgerItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StarLedgerItemListEnvelopeToJson(this);
}
